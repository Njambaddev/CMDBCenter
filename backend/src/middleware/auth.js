const crypto = require('crypto');
const env = require('../config/env');
const { ApiError } = require('./errorHandler');

/**
 * Server-side Session Vault:
 * Maps an opaque random 256-bit dashboard token to the user's session context,
 * keeping Znuny `SessionID` strictly on the server and NEVER sending it to the browser.
 */
const SESSION_VAULT = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function resolveRole(userLogin = '') {
  const login = String(userLogin).trim().toLowerCase();
  if (env.rbac.adminUsers.has(login) || login === 'root@localhost' || login.includes('admin')) {
    return 'admin';
  }
  if (env.rbac.viewerUsers.has(login)) {
    return 'viewer';
  }
  return 'operator';
}

function createDashboardSession({ userLogin, fullName, email = '', role, mode, znunySessionId = null }) {
  const token = crypto.randomBytes(32).toString('hex');
  const effectiveRole = role || resolveRole(userLogin);
  const now = Date.now();
  const record = {
    token,
    userLogin,
    fullName: fullName || userLogin,
    email,
    role: effectiveRole,
    mode: mode === 'demo' ? 'demo' : 'live',
    znunySessionId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  SESSION_VAULT.set(token, record);
  return record;
}

function getDashboardSession(token) {
  if (!token) return null;
  const session = SESSION_VAULT.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    SESSION_VAULT.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function updateSessionMode(token, newMode) {
  const session = getDashboardSession(token);
  if (!session) return null;
  session.mode = newMode === 'demo' ? 'demo' : 'live';
  return session;
}

function destroyDashboardSession(token) {
  if (!token) return null;
  const existing = SESSION_VAULT.get(token);
  SESSION_VAULT.delete(token);
  return existing;
}

function toPublicUser(session) {
  if (!session) return null;
  return {
    username: session.userLogin,
    fullName: session.fullName,
    email: session.email,
    role: session.role,
    mode: session.mode,
    hasLiveSession: Boolean(session.znunySessionId || (env.znuny.serviceUser && env.znuny.servicePassword)),
    permissions: {
      canRead: true,
      canWrite: session.role === 'admin' || session.role === 'operator',
      canDelete: session.role === 'admin',
      canManageSettings: session.role === 'admin',
    },
  };
}

function extractToken(req) {
  const headerToken = req.headers['x-dashboard-token'];
  if (headerToken) return String(headerToken).trim();
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.cookies && req.cookies.atlancis_session) {
    return req.cookies.atlancis_session;
  }
  return null;
}

function requireAuth(req, _res, next) {
  const token = extractToken(req);
  const session = getDashboardSession(token);
  if (!session) {
    return next(new ApiError(401, 'Authentication required. Please sign in with your Znuny Agent account.', 'AUTH_REQUIRED'));
  }
  if (session.mode === 'demo' && !env.enableDemo) {
    return next(new ApiError(401, 'Demo mode is disabled. Please sign in with your Znuny Agent account.', 'AUTH_REQUIRED'));
  }
  req.session = session;
  req.user = toPublicUser(session);
  return next();
}

function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.session) {
      return next(new ApiError(401, 'Authentication required.', 'AUTH_REQUIRED'));
    }
    if (!allowedRoles.includes(req.session.role)) {
      return next(
        new ApiError(
          403,
          `Insufficient permissions. Required role: ${allowedRoles.join(' or ')} (your role: ${req.session.role}).`,
          'FORBIDDEN_ROLE'
        )
      );
    }
    return next();
  };
}

/**
 * Enforces both RBAC write permission AND the Live-Write Safety Gate when operating in Live mode.
 */
function requireWriteAccess(req, _res, next) {
  if (!req.session) {
    return next(new ApiError(401, 'Authentication required.', 'AUTH_REQUIRED'));
  }
  if (req.session.role === 'viewer') {
    return next(new ApiError(403, 'Viewer accounts have read-only access and cannot modify records.', 'READ_ONLY_ROLE'));
  }
  if (req.session.mode === 'live' && !env.getAllowLiveWrites()) {
    return next(
      new ApiError(
        403,
        'Live Write Protection is currently active. Verify Znuny API operations in Settings and enable "Allow Live Writes" (Admin) before mutating live Znuny data, or switch to Demo Mode to test write workflows.',
        'LIVE_WRITES_DISABLED'
      )
    );
  }
  return next();
}

module.exports = {
  resolveRole,
  createDashboardSession,
  getDashboardSession,
  updateSessionMode,
  destroyDashboardSession,
  toPublicUser,
  extractToken,
  requireAuth,
  requireRole,
  requireWriteAccess,
};
