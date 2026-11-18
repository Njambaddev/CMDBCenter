const {
  getTicketCatalogs,
  listTickets,
  getTicketById,
  downloadTicketAttachment,
  createTicket,
  updateTicket,
} = require('../services/ticketService');

async function getCatalogs(req, res, next) {
  try {
    const catalogs = await getTicketCatalogs(req.session);
    return res.json({
      success: true,
      data: catalogs,
    });
  } catch (err) {
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const result = await listTickets(req.session, req.query);
    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

async function getById(req, res, next) {
  try {
    const ticket = await getTicketById(req.session, req.params.id);
    return res.json({
      success: true,
      data: ticket,
    });
  } catch (err) {
    return next(err);
  }
}

async function downloadAttachment(req, res, next) {
  try {
    const { id, articleId, attachmentId } = req.params;
    const file = await downloadTicketAttachment(req.session, {
      ticketId: id,
      articleId,
      attachmentId,
    });
    const buffer = Buffer.from(file.contentBase64, 'base64');
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${String(file.filename || 'attachment').replace(/"/g, '')}"`);
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const created = await createTicket(req.session, req.body || {});
    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const updated = await updateTicket(req.session, req.params.id, req.body || {});
    return res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getCatalogs,
  list,
  getById,
  downloadAttachment,
  create,
  update,
};
