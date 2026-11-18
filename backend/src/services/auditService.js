const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(__dirname, '../../data');
const AUDIT_FILE = path.join(DATA_DIR, 'audit-logs.json');
const MAX_ENTRIES = 2000;

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(AUDIT_FILE)) {
    const seed = [
      {
        id: 'aud-seed-001',
        user: 'system.bootstrap',
        role: 'admin',
        mode: 'live',
        action: 'SYSTEM_INIT',
        recordType: 'System',
        recordId: 'ITSM-Center',
        recordLabel: 'Dashboard API Gateway Initialized (Live Writes Gated)',
        previousValue: null,
        newValue: { allowLiveWrites: false, wsTicket: 'portal_with_catalogue', wsCmdb: 'PDU_CircuitsOutlets_API' },
        timestamp: new Date().toISOString(),
        source: 'dashboard',
      },
    ];
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(seed, null, 2), 'utf8');
  }
}

function readAuditEntries() {
  ensureStore();
  try {
    const raw = fs.readFileSync(AUDIT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

/**
 * Appends an audit entry ONLY after Znuny (or Demo store) confirms an operation succeeded.
 */
function recordAudit({
  user = 'unknown',
  role = 'operator',
  mode = 'live',
  action,
  recordType,
  recordId,
  recordLabel = '',
  previousValue = null,
  newValue = null,
}) {
  const entries = readAuditEntries();
  const entry = {
    id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    user,
    role,
    mode,
    action,
    recordType,
    recordId: String(recordId || ''),
    recordLabel: String(recordLabel || ''),
    previousValue,
    newValue,
    timestamp: new Date().toISOString(),
    source: 'dashboard',
  };
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries, null, 2), 'utf8');
  return entry;
}

function queryAuditLogs({ mode, recordType, user, action, search, page = 1, pageSize = 50 } = {}) {
  let list = readAuditEntries();

  if (mode) {
    list = list.filter((e) => e.mode === mode);
  }
  if (recordType) {
    list = list.filter((e) => e.recordType.toLowerCase() === String(recordType).toLowerCase());
  }
  if (user) {
    const u = String(user).toLowerCase();
    list = list.filter((e) => e.user.toLowerCase().includes(u));
  }
  if (action) {
    list = list.filter((e) => e.action.toLowerCase().includes(String(action).toLowerCase()));
  }
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(
      (e) =>
        e.recordId.toLowerCase().includes(q) ||
        e.recordLabel.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.user.toLowerCase().includes(q)
    );
  }

  const total = list.length;
  const start = (Math.max(1, Number(page)) - 1) * Number(pageSize);
  const items = list.slice(start, start + Number(pageSize));
  return { items, total, page: Number(page), pageSize: Number(pageSize) };
}

module.exports = {
  recordAudit,
  queryAuditLogs,
};
