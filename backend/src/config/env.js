const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const parseList = (val) =>
  String(val || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const runtimeState = {
  allowLiveWrites: String(process.env.ALLOW_LIVE_WRITES || 'true').toLowerCase() === 'true',
  lastVerification: null,
};

const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: parseList(process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:8090'),
  // ITSM Center runs against the real Znuny CMDB. The in-memory demo sandbox is opt-in only.
  enableDemo: String(process.env.ENABLE_DEMO_MODE || 'false').toLowerCase() === 'true',
  defaultMode: 'live',
  znuny: {
    baseUrl: (process.env.ZNUNY_BASE_URL || 'https://mysupportstaging.atlancis.com/otrs/nph-genericinterface.pl').replace(/\/+$/, ''),
    hostHeader: process.env.ZNUNY_HOST_HEADER || 'mysupportstaging.atlancis.com',
    rejectUnauthorized: String(process.env.ZNUNY_REJECT_UNAUTHORIZED || 'false').toLowerCase() === 'true',
    timeoutMs: Number(process.env.ZNUNY_TIMEOUT_MS || 25000),
    wsTicket: process.env.ZNUNY_WS_TICKET || 'portal_with_catalogue',
    wsCmdb: process.env.ZNUNY_WS_CMDB || 'PDU_CircuitsOutlets_API',
    wsSla: process.env.ZNUNY_WS_SLA || 'SLA Api',
    serviceUser: process.env.ZNUNY_SERVICE_USER || '',
    servicePassword: process.env.ZNUNY_SERVICE_PASSWORD || '',
  },
  rbac: {
    adminUsers: new Set(parseList(process.env.ADMIN_USERS || 'root@localhost,David,Njuguna,Julius.Mutai').map((u) => u.toLowerCase())),
    viewerUsers: new Set(parseList(process.env.VIEWER_USERS || '').map((u) => u.toLowerCase())),
  },
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS || 60),
  getAllowLiveWrites: () => runtimeState.allowLiveWrites,
  setAllowLiveWrites: (enabled) => {
    runtimeState.allowLiveWrites = Boolean(enabled);
    return runtimeState.allowLiveWrites;
  },
  getLastVerification: () => runtimeState.lastVerification,
  setLastVerification: (report) => {
    runtimeState.lastVerification = report;
    return runtimeState.lastVerification;
  },
};

module.exports = env;
