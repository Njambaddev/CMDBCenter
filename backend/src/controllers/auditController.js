const { queryAuditLogs } = require('../services/auditService');

async function listAuditLogs(req, res, next) {
  try {
    const result = queryAuditLogs(req.query || {});
    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listAuditLogs,
};
