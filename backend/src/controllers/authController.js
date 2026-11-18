const env = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');
const {
  createDashboardSession,
  updateSessionMode,
  destroyDashboardSession,
  toPublicUser,
  extractToken,
} = require('../middleware/auth');
const { createAgentSession, fetchAgentProfile, removeAgentSession } = require('../services/znunyClient');
const { createZnunyWebSession } = require('../services/znunyClassService');
const { warmLiveInventory } = require('../services/cmdbService');
const { recordAudit } = require('../services/auditService');

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 8 * 60 * 60 * 1000,
};

function buildSystemMeta() {
  return {
    allowLiveWrites: env.getAllowLiveWrites(),
    defaultMode: env.defaultMode,
    demoEnabled: env.enableDemo,
    hasServiceAccount: Boolean(env.znuny.serviceUser && env.znuny.servicePassword),
    webservices: {
      ticket: env.znuny.wsTicket,
      cmdb: env.znuny.wsCmdb,
      sla: env.znuny.wsSla,
    },
  };
}

async function login(req, res, next) {
  try {
    const { username, password, mode = 'live' } = req.body || {};
    const cleanUser = String(username || '').trim();
    if (!cleanUser || !password) {
      throw new ApiError(400, 'Znuny Agent username and password are required.', 'MISSING_CREDENTIALS');
    }

    // Fast 1-round-trip login (`SessionCreate` only); profile enrichment + CMDB cache warm run asynchronously
    const { sessionId } = await createAgentSession(cleanUser, String(password), { skipProfileFetch: true });

    const session = createDashboardSession({
      userLogin: cleanUser,
      fullName: cleanUser,
      email: '',
      mode: env.enableDemo && mode === 'demo' ? 'demo' : 'live',
      znunySessionId: sessionId,
    });

    // Immediately pre-warm CMDB inventory so Znuny's CPU is 100% dedicated to dashboard data;
    // defer optional SessionGet profile enrichment until after the initial dashboard load completes.
    warmLiveInventory(session);
    const profileTimer = setTimeout(async () => {
      try {
        const [profile, webCookie] = await Promise.all([
          fetchAgentProfile(sessionId),
          createZnunyWebSession(cleanUser, String(password)).catch(() => null),
        ]);
        const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
        if (fullName) session.fullName = fullName;
        if (profile.email) session.email = profile.email;
        if (webCookie) session.znunyWebCookie = webCookie;
      } catch (_bgErr) {
        // Non-blocking
      }
    }, 10000);
    if (typeof profileTimer.unref === 'function') profileTimer.unref();

    recordAudit({
      user: session.userLogin,
      role: session.role,
      mode: session.mode,
      action: 'AUTH_LOGIN',
      recordType: 'Session',
      recordId: session.userLogin,
      recordLabel: `Authenticated via Znuny GenericInterface (${env.znuny.wsTicket})`,
      previousValue: null,
      newValue: { mode: session.mode, role: session.role },
    });

    res.cookie('atlancis_session', session.token, COOKIE_OPTIONS);
    return res.json({
      success: true,
      data: {
        token: session.token,
        user: toPublicUser(session),
        system: buildSystemMeta(),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function loginDemo(req, res, next) {
  try {
    if (!env.enableDemo) {
      throw new ApiError(403, 'Demo mode is disabled. Sign in with your Znuny Agent account to work with live CMDB data.', 'DEMO_DISABLED');
    }
    const { role = 'admin', username } = req.body || {};
    const allowedRoles = ['admin', 'operator', 'viewer'];
    const selectedRole = allowedRoles.includes(role) ? role : 'admin';

    const defaultProfiles = {
      admin: { login: 'David', fullName: 'David Kiplagat (Infra Admin)', email: 'david@atlancis.com' },
      operator: { login: 'Njuguna', fullName: 'Njuguna (NOC Operations)', email: 'njuguna@atlancis.com' },
      viewer: { login: 'auditor.readonly', fullName: 'Compliance Auditor (Read-Only)', email: 'audit@atlancis.com' },
    };
    const preset = defaultProfiles[selectedRole];
    const finalLogin = username ? String(username).trim() : preset.login;

    const session = createDashboardSession({
      userLogin: finalLogin,
      fullName: username ? `${finalLogin} (${selectedRole})` : preset.fullName,
      email: preset.email,
      role: selectedRole,
      mode: 'demo',
      znunySessionId: null,
    });

    recordAudit({
      user: session.userLogin,
      role: session.role,
      mode: 'demo',
      action: 'AUTH_DEMO_START',
      recordType: 'Session',
      recordId: session.userLogin,
      recordLabel: `Entered Interactive Demo Mode as ${selectedRole}`,
      previousValue: null,
      newValue: { mode: 'demo', role: selectedRole },
    });

    res.cookie('atlancis_session', session.token, COOKIE_OPTIONS);
    return res.json({
      success: true,
      data: {
        token: session.token,
        user: toPublicUser(session),
        system: buildSystemMeta(),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function switchMode(req, res, next) {
  try {
    const { mode } = req.body || {};
    if (mode !== 'live' && mode !== 'demo') {
      throw new ApiError(400, 'Mode must be either "live" or "demo".', 'INVALID_MODE');
    }
    if (mode === 'demo' && !env.enableDemo) {
      throw new ApiError(403, 'Demo mode is disabled on this ITSM Center instance.', 'DEMO_DISABLED');
    }

    const hasServiceAccount = Boolean(env.znuny.serviceUser && env.znuny.servicePassword);
    if (mode === 'live' && !req.session.znunySessionId && !hasServiceAccount) {
      throw new ApiError(
        401,
        'Switching to Live Znuny API Mode requires signing in with a valid Znuny Agent account (or configuring ZNUNY_SERVICE_USER in backend/.env).',
        'ZNUNY_LOGIN_REQUIRED'
      );
    }

    const prevMode = req.session.mode;
    const updated = updateSessionMode(req.session.token, mode);

    recordAudit({
      user: updated.userLogin,
      role: updated.role,
      mode: updated.mode,
      action: 'MODE_SWITCH',
      recordType: 'Session',
      recordId: updated.userLogin,
      recordLabel: `Switched data source mode: ${prevMode} -> ${updated.mode}`,
      previousValue: { mode: prevMode },
      newValue: { mode: updated.mode },
    });

    return res.json({
      success: true,
      data: {
        user: toPublicUser(updated),
        system: buildSystemMeta(),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = extractToken(req);
    const removed = destroyDashboardSession(token);
    if (removed && removed.znunySessionId) {
      await removeAgentSession(removed.znunySessionId);
    }
    res.clearCookie('atlancis_session');
    return res.json({
      success: true,
      data: { loggedOut: true },
    });
  } catch (err) {
    return next(err);
  }
}

// Public (unauthenticated) bootstrap info for the login page. Contains no secrets.
async function publicConfig(req, res) {
  return res.json({
    success: true,
    data: {
      demoEnabled: env.enableDemo,
      cmdbWebservice: env.znuny.wsCmdb,
      znunyHost: env.znuny.hostHeader,
    },
  });
}

async function me(req, res) {
  return res.json({
    success: true,
    data: {
      user: toPublicUser(req.session),
      system: buildSystemMeta(),
    },
  });
}

module.exports = {
  login,
  loginDemo,
  publicConfig,
  switchMode,
  logout,
  me,
};
