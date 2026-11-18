const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const env = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');

const httpsAgent = new https.Agent({
  rejectUnauthorized: env.znuny.rejectUnauthorized,
  keepAlive: true,
  maxSockets: 6,
});

const httpClient = axios.create({
  timeout: env.znuny.timeoutMs,
  httpsAgent,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(env.znuny.hostHeader ? { Host: env.znuny.hostHeader } : {}),
  },
  validateStatus: () => true,
});

/**
 * Two-tier Stale-While-Revalidate (SWR) cache:
 * - In-memory Map for sub-millisecond reads
 * - Optional disk snapshot (`backend/data/live-znuny-cache.json`, mode 0600) for normalized
 *   CMDB/Ticket datasets ONLY (never stores passwords, tokens, or Znuny SessionIDs).
 *   Ensures dashboard loads are instant (<20ms) even after TTL expiry or backend restarts,
 *   while background revalidation keeps data synced with live Znuny.
 */
const CACHE = new Map();
const DISK_CACHE_FILE = path.resolve(__dirname, '../../data/live-znuny-cache.json');
const DEFAULT_STALE_TTL_SEC = 24 * 60 * 60; // 24 hours stale-while-revalidate window
let diskFlushTimer = null;
let cachedServiceSession = { sessionId: null, expiresAt: 0 };

function loadDiskCacheOnStartup() {
  try {
    if (!fs.existsSync(DISK_CACHE_FILE)) return;
    const raw = fs.readFileSync(DISK_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.entries !== 'object') return;
    if (parsed.baseUrl && parsed.baseUrl !== env.znuny.baseUrl) {
      console.log(`[Cache] Znuny baseUrl changed (${parsed.baseUrl} -> ${env.znuny.baseUrl}); discarding stale snapshot.`);
      return;
    }
    if (!parsed.baseUrl) return;
    const now = Date.now();
    let restored = 0;
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (entry && entry.staleExpiresAt > now && entry.value !== undefined) {
        CACHE.set(key, {
          value: entry.value,
          updatedAt: entry.updatedAt || now,
          freshExpiresAt: entry.freshExpiresAt || 0,
          staleExpiresAt: entry.staleExpiresAt,
          persist: true,
        });
        restored += 1;
      }
    }
    if (restored > 0) {
      console.log(`[Cache] Restored ${restored} live Znuny dataset snapshot(s) from disk.`);
    }
  } catch (_err) {
    // Ignore corrupt/missing cache snapshot
  }
}

function scheduleDiskFlush() {
  if (diskFlushTimer) return;
  diskFlushTimer = setTimeout(() => {
    diskFlushTimer = null;
    try {
      const dir = path.dirname(DISK_CACHE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      const now = Date.now();
      const serializable = {};
      for (const [key, entry] of CACHE.entries()) {
        if (entry.persist && entry.staleExpiresAt > now) {
          serializable[key] = {
            updatedAt: entry.updatedAt,
            freshExpiresAt: entry.freshExpiresAt,
            staleExpiresAt: entry.staleExpiresAt,
            value: entry.value,
          };
        }
      }
      const tmpFile = `${DISK_CACHE_FILE}.tmp`;
      fs.writeFileSync(
        tmpFile,
        JSON.stringify({ baseUrl: env.znuny.baseUrl, savedAt: new Date().toISOString(), entries: serializable }),
        { mode: 0o600 }
      );
      fs.renameSync(tmpFile, DISK_CACHE_FILE);
    } catch (_err) {
      // Non-fatal
    }
  }, 400);
  if (typeof diskFlushTimer.unref === 'function') {
    diskFlushTimer.unref();
  }
}

loadDiskCacheOnStartup();

/**
 * Returns full SWR cache metadata `{ value, isFresh, isStale, updatedAt }` or `null`.
 */
function getCacheEntry(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (now > entry.staleExpiresAt) {
    CACHE.delete(key);
    return null;
  }
  const isFresh = now <= entry.freshExpiresAt;
  return {
    value: entry.value,
    isFresh,
    isStale: !isFresh,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Returns cached value only if strictly within fresh TTL (backward-compatible helper).
 */
function getCached(key) {
  const entry = getCacheEntry(key);
  return entry && entry.isFresh ? entry.value : null;
}

function setCached(key, value, ttlSec = env.cacheTtlSeconds, options = {}) {
  const now = Date.now();
  const persist = Boolean(options.persist);
  const staleTtlSec = options.staleTtlSec || (persist ? DEFAULT_STALE_TTL_SEC : ttlSec);
  CACHE.set(key, {
    value,
    updatedAt: now,
    freshExpiresAt: now + ttlSec * 1000,
    staleExpiresAt: now + Math.max(ttlSec, staleTtlSec) * 1000,
    persist,
  });
  if (persist) {
    scheduleDiskFlush();
  }
  return value;
}

function listCacheKeys(prefix = '') {
  const out = [];
  for (const key of CACHE.keys()) {
    if (!prefix || key.startsWith(prefix)) {
      out.push(key);
    }
  }
  return out;
}

function invalidateCachePrefix(prefix = '') {
  let touchedPersist = false;
  for (const [key, entry] of CACHE.entries()) {
    if (!prefix || key.startsWith(prefix)) {
      if (entry.persist) touchedPersist = true;
      CACHE.delete(key);
    }
  }
  if (touchedPersist) {
    scheduleDiskFlush();
  }
}

function buildWsUrl(webserviceName, routePath) {
  const encodedWs = encodeURIComponent(webserviceName);
  const normalizedRoute = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${env.znuny.baseUrl}/Webservice/${encodedWs}${normalizedRoute}`;
}

/**
 * Inspects Znuny GenericInterface responses:
 * 1. HTTP 500 fault `{ faultcode: "Server", faultstring: "..." }` (e.g. missing operation module)
 * 2. HTTP 200 `{ Error: { ErrorCode: "...", ErrorMessage: "..." } }`
 * 3. Plain string errors like `"Unsupported request content structure."`
 */
function unwrapZnunyResponse(response, contextLabel) {
  const { status, data } = response;

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed.includes('Unsupported request content structure')) {
      throw new ApiError(400, `${contextLabel}: Znuny REST rejected empty or malformed payload.`, 'ZNUNY_BAD_PAYLOAD');
    }
    throw new ApiError(
      status >= 400 ? status : 502,
      `${contextLabel}: Unexpected non-JSON response from Znuny (${trimmed.slice(0, 140)})`,
      'ZNUNY_UPSTREAM_ERROR'
    );
  }

  if (data && data.faultstring) {
    const fault = String(data.faultstring);
    if (fault.includes("Can't load operation backend module")) {
      throw new ApiError(
        501,
        `Znuny operation module is not installed on Mysupport-Prod-App: ${fault}`,
        'ZNUNY_MODULE_MISSING',
        { faultstring: fault }
      );
    }
    throw new ApiError(502, `${contextLabel}: ${fault}`, 'ZNUNY_SOAP_FAULT');
  }

  if (data && data.Error) {
    const errCode = data.Error.ErrorCode || 'Znuny.Error';
    const errMsg = data.Error.ErrorMessage || 'Znuny returned an operation error.';
    if (errCode.includes('AuthFail') || errCode.includes('SessionInvalid')) {
      throw new ApiError(
        401,
        `Znuny authentication failed or session expired (${errCode}). Please sign in again.`,
        'ZNUNY_AUTH_FAIL'
      );
    }
    if (errCode.includes('AccessDenied')) {
      throw new ApiError(403, `Znuny permission denied: ${errMsg}`, 'ZNUNY_ACCESS_DENIED');
    }
    throw new ApiError(400, `${errMsg} (${errCode})`, errCode);
  }

  if (status >= 400) {
    throw new ApiError(status, `${contextLabel}: Znuny HTTP ${status}`, 'ZNUNY_HTTP_ERROR');
  }

  return data || {};
}

async function znunyRequest({ webservice, method = 'GET', route, params = undefined, body = undefined, context = '' }) {
  const url = buildWsUrl(webservice, route);
  const label = context || `${method} ${webservice}${route}`;
  let response;
  try {
    response = await httpClient.request({
      url,
      method,
      params,
      // Znuny REST rejects `{}` on POST/PATCH; ensure body is undefined on GET or non-empty on POST
      data: method === 'GET' ? undefined : body,
    });
  } catch (networkErr) {
    throw new ApiError(
      503,
      `Unable to reach Znuny GenericInterface at ${env.znuny.baseUrl}: ${networkErr.message}`,
      'ZNUNY_UNREACHABLE'
    );
  }
  return unwrapZnunyResponse(response, label);
}

/**
 * Fetches optional agent profile metadata (`firstName`, `lastName`, `email`) for a SessionID.
 * Safe to invoke asynchronously in the background after login so `POST /auth/login` never waits on a 2nd round-trip.
 */
async function fetchAgentProfile(sessionId) {
  let profile = { firstName: '', lastName: '', email: '', userType: 'User' };
  if (!sessionId) return profile;
  try {
    const metaRes = await znunyRequest({
      webservice: env.znuny.wsTicket,
      method: 'GET',
      route: `/Session/${encodeURIComponent(sessionId)}`,
      context: 'SessionGet',
    });
    const kv = {};
    if (Array.isArray(metaRes.SessionData)) {
      for (const item of metaRes.SessionData) {
        if (item && item.Key) kv[item.Key] = item.Value;
      }
    }
    profile = {
      userId: kv.UserID || null,
      firstName: kv.UserFirstname || '',
      lastName: kv.UserLastname || '',
      email: kv.UserEmail || '',
      userType: kv.UserType || 'User',
    };
  } catch (_err) {
    // Non-fatal metadata enrichment
  }
  return profile;
}

/**
 * Authenticates an agent via `portal_with_catalogue` `POST /Session` (`Session::SessionCreate`).
 * Note: Sending `UserLogin` (rather than `CustomerUserLogin`) strictly authenticates against
 * Znuny's `Kernel::System::User` agent table (`UserType = 'User'`), so a blocking `SessionGet`
 * round-trip is unnecessary on the critical login path when `skipProfileFetch` is true.
 */
async function createAgentSession(userLogin, password, { skipProfileFetch = true } = {}) {
  const res = await znunyRequest({
    webservice: env.znuny.wsTicket,
    method: 'POST',
    route: '/Session',
    body: {
      UserLogin: userLogin,
      Password: password,
    },
    context: 'SessionCreate',
  });

  const sessionId = res.SessionID;
  if (!sessionId) {
    throw new ApiError(401, 'Znuny did not return a SessionID. Verify agent credentials.', 'ZNUNY_AUTH_FAIL');
  }

  const profile = skipProfileFetch
    ? { firstName: '', lastName: '', email: '', userType: 'User' }
    : await fetchAgentProfile(sessionId);

  return { sessionId, profile };
}

async function removeAgentSession(sessionId) {
  if (!sessionId) return;
  try {
    await znunyRequest({
      webservice: env.znuny.wsTicket,
      method: 'DELETE',
      route: `/Session/${encodeURIComponent(sessionId)}`,
      context: 'SessionRemove',
    });
  } catch (_ignore) {
    // Best-effort cleanup
  }
}

/**
 * Resolves the active Znuny auth credentials `{ SessionID }` (or fallback service account)
 * for outbound GenericInterface calls.
 */
async function resolveZnunyAuth(dashboardSession) {
  if (dashboardSession && dashboardSession.znunySessionId) {
    return { SessionID: dashboardSession.znunySessionId };
  }
  if (env.znuny.serviceUser && env.znuny.servicePassword) {
    if (cachedServiceSession.sessionId && Date.now() < cachedServiceSession.expiresAt) {
      return { SessionID: cachedServiceSession.sessionId };
    }
    const { sessionId } = await createAgentSession(env.znuny.serviceUser, env.znuny.servicePassword, {
      skipProfileFetch: true,
    });
    cachedServiceSession = {
      sessionId,
      expiresAt: Date.now() + 45 * 60 * 1000,
    };
    return { SessionID: sessionId };
  }
  throw new ApiError(
    401,
    'Live Znuny session required. Sign in with your Znuny Agent credentials (or configure ZNUNY_SERVICE_USER in backend .env).',
    'ZNUNY_SESSION_MISSING'
  );
}

/**
 * Runs a live diagnostic check across all three configured Znuny webservices in parallel waves:
 * 1. `portal_with_catalogue` (ID 4) — Catalog endpoints
 * 2. `SLA Api` (ID 9) — Service list
 * 3. `PDU_CircuitsOutlets_API` (ID 7) — CMDB Search check + Link::LinkList module check
 */
async function verifyZnunyConnectivity(dashboardSession) {
  let authPayload = null;
  try {
    authPayload = await resolveZnunyAuth(dashboardSession);
  } catch (_noAuth) {
    authPayload = null;
  }

  const checkCatalog = async () => {
    try {
      const prio = await znunyRequest({
        webservice: env.znuny.wsTicket,
        method: 'GET',
        route: '/Catalog/Priority',
        context: 'Verify portal_with_catalogue',
      });
      const count = Object.keys(prio.PriorityList || {}).length;
      return {
        service: env.znuny.wsTicket,
        endpoint: 'GET /Catalog/Priority',
        status: 'ok',
        detail: `Reachable (${count} ticket priorities loaded)`,
      };
    } catch (err) {
      return {
        service: env.znuny.wsTicket,
        endpoint: 'GET /Catalog/Priority',
        status: 'error',
        detail: err.message,
      };
    }
  };

  const checkSla = async () => {
    try {
      const svc = await znunyRequest({
        webservice: env.znuny.wsSla,
        method: 'GET',
        route: '/Service',
        context: 'Verify SLA Api',
      });
      const count = Object.keys(svc.ServiceList || {}).length;
      return {
        service: env.znuny.wsSla,
        endpoint: 'GET /Service',
        status: 'ok',
        detail: `Reachable (${count} ITSM services registered)`,
      };
    } catch (err) {
      return {
        service: env.znuny.wsSla,
        endpoint: 'GET /Service',
        status: 'error',
        detail: err.message,
      };
    }
  };

  const checkCmdb = async () => {
    if (!authPayload) {
      return {
        service: env.znuny.wsCmdb,
        endpoint: 'POST /servers/search (ConfigItem::ConfigItemSearch)',
        status: 'warning',
        detail: 'Sign in with a Live Znuny Agent account to verify authenticated CMDB operations.',
      };
    }
    try {
      const srvSearch = await znunyRequest({
        webservice: env.znuny.wsCmdb,
        method: 'POST',
        route: '/servers/search',
        body: {
          ...authPayload,
          ConfigItem: { Class: 'Servers' },
        },
        context: 'Verify CMDB ServersSearch',
      });
      const rawIds = srvSearch.ConfigItemIDs ?? srvSearch.ConfigItemID;
      const ids = Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [];
      return {
        service: env.znuny.wsCmdb,
        endpoint: 'POST /servers/search (ConfigItem::ConfigItemSearch)',
        status: 'ok',
        detail: `Authenticated & verified (${ids.length} Server CIs returned)`,
      };
    } catch (err) {
      return {
        service: env.znuny.wsCmdb,
        endpoint: 'POST /servers/search (ConfigItem::ConfigItemSearch)',
        status: 'error',
        detail: err.message,
      };
    }
  };

  const checkLinks = async () => {
    try {
      await znunyRequest({
        webservice: env.znuny.wsCmdb,
        method: 'POST',
        route: '/links/list',
        body: {
          ...(authPayload || { UserLogin: 'probe' }),
          Object: 'ITSMConfigItem',
        },
        context: 'Verify Link::LinkList',
      });
      return {
        service: env.znuny.wsCmdb,
        endpoint: 'POST /links/list (Link::LinkList)',
        status: 'ok',
        detail: 'Link::LinkList operation module is active',
      };
    } catch (err) {
      if (err.code === 'ZNUNY_MODULE_MISSING') {
        return {
          service: env.znuny.wsCmdb,
          endpoint: 'POST /links/list (Link::LinkList)',
          status: 'unsupported',
          detail:
            'Route is configured in Webservice ID 7, but Kernel/GenericInterface/Operation/Link/*.pm is not installed on Mysupport-Prod-App. Dashboard automatically falls back to attribute-inferred topology in Live mode.',
        };
      }
      return {
        service: env.znuny.wsCmdb,
        endpoint: 'POST /links/list (Link::LinkList)',
        status: 'warning',
        detail: err.message,
      };
    }
  };

  // Run in 2 gentle waves of 2 to match the 2-vCPU Znuny host without overloading CGI workers
  const [c1, c2] = await Promise.all([checkCatalog(), checkSla()]);
  const [c3, c4] = await Promise.all([checkCmdb(), checkLinks()]);
  const checks = [c1, c2, c3, c4];

  const coreOk = checks
    .filter((c) => !c.endpoint.includes('/links/list'))
    .every((c) => c.status === 'ok' || c.status === 'warning');

  const report = {
    verifiedAt: new Date().toISOString(),
    baseUrl: env.znuny.baseUrl,
    hostHeader: env.znuny.hostHeader,
    coreHealthy: coreOk,
    checks,
  };
  env.setLastVerification(report);
  return report;
}

module.exports = {
  znunyRequest,
  createAgentSession,
  fetchAgentProfile,
  removeAgentSession,
  resolveZnunyAuth,
  verifyZnunyConnectivity,
  getCacheEntry,
  getCached,
  setCached,
  listCacheKeys,
  invalidateCachePrefix,
};
