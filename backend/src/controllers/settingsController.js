const env = require('../config/env');
const { verifyZnunyConnectivity, invalidateCachePrefix } = require('../services/znunyClient');
const { recordAudit } = require('../services/auditService');
const { CMDB_CLASSES } = require('../config/cmdbSchemas');

async function getStatus(req, res, next) {
  try {
    return res.json({
      success: true,
      data: {
        currentMode: req.session.mode,
        allowLiveWrites: env.getAllowLiveWrites(),
        hasServiceAccount: Boolean(env.znuny.serviceUser && env.znuny.servicePassword),
        hasAgentLiveSession: Boolean(req.session.znunySessionId),
        cacheTtlSeconds: env.cacheTtlSeconds,
        znuny: {
          baseUrl: env.znuny.baseUrl,
          hostHeader: env.znuny.hostHeader,
          rejectUnauthorized: env.znuny.rejectUnauthorized,
          timeoutMs: env.znuny.timeoutMs,
          webservices: [
            {
              id: 4,
              name: env.znuny.wsTicket,
              purpose: 'Agent Session Auth, Ticket CRUD, Ticket History, Attachments & Catalogs',
              routes: [
                'POST /Session (Session::SessionCreate)',
                'GET /Session/:SessionID (Session::SessionGet)',
                'DELETE /Session/:SessionID (Session::SessionRemove)',
                'POST /Ticket/Search (Ticket::TicketSearch)',
                'GET /Ticket/:TicketID (Ticket::TicketGet)',
                'POST /Ticket (Ticket::TicketCreate)',
                'PATCH /Ticket/:TicketID (Ticket::TicketUpdate)',
                'GET /Ticket/History/:TicketID (Ticket::TicketHistoryGet)',
                'GET /Ticket/Article/:ArticleID/Attachment/:AttachmentID (Ticket::ArticleAttachmentGet)',
                'GET /Catalog/{Queue,Priority,Service,TicketType}',
              ],
            },
            {
              id: 7,
              name: env.znuny.wsCmdb,
              purpose: '23-Class ITSM CMDB Inventory CRUD & Search (80 REST routes)',
              routes: [
                'POST /<resource>/search (ConfigItem::ConfigItemSearch)',
                'GET /<resource>/:ConfigItemID (ConfigItem::ConfigItemGet)',
                'POST /<resource> (ConfigItem::ConfigItemCreate)',
                'PATCH /<resource>/:ConfigItemID (ConfigItem::ConfigItemUpdate)',
                'DELETE /<resource>/:ConfigItemID (ConfigItem::ConfigItemDelete)',
                'POST /links/list, POST /links, POST /links/delete (Link::* — fallback enabled when module absent)',
              ],
            },
            {
              id: 9,
              name: env.znuny.wsSla,
              purpose: 'ITSM Service & SLA Target Escalation Metadata',
              routes: ['GET /Service (Catalog::ServiceList)', 'POST /ServiceSLA (Catalog::ServiceSLAList)'],
            },
          ],
          registeredClassCount: Object.keys(CMDB_CLASSES).length,
        },
        lastVerification: env.getLastVerification(),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function verifyZnuny(req, res, next) {
  try {
    const report = await verifyZnunyConnectivity(req.session);
    return res.json({
      success: true,
      data: report,
    });
  } catch (err) {
    return next(err);
  }
}

async function toggleLiveWrites(req, res, next) {
  try {
    const prev = env.getAllowLiveWrites();
    const nextVal = Boolean(req.body && req.body.enabled);
    env.setAllowLiveWrites(nextVal);

    recordAudit({
      user: req.session.userLogin,
      role: req.session.role,
      mode: req.session.mode,
      action: 'SETTINGS_LIVE_WRITES_TOGGLE',
      recordType: 'Settings',
      recordId: 'ALLOW_LIVE_WRITES',
      recordLabel: nextVal ? 'Enabled Live Znuny Write Operations' : 'Enabled Live Write Protection (Read-Only Guard)',
      previousValue: { allowLiveWrites: prev },
      newValue: { allowLiveWrites: nextVal },
    });

    return res.json({
      success: true,
      data: {
        allowLiveWrites: nextVal,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function clearCache(req, res, next) {
  try {
    invalidateCachePrefix('');
    return res.json({
      success: true,
      data: { cleared: true, clearedAt: new Date().toISOString() },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getStatus,
  verifyZnuny,
  toggleLiveWrites,
  clearCache,
};
