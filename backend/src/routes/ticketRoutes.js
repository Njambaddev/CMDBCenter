const express = require('express');
const { requireAuth, requireWriteAccess } = require('../middleware/auth');
const ticketController = require('../controllers/ticketController');

const router = express.Router();

router.use(requireAuth);

router.get('/catalogs', ticketController.getCatalogs);
router.get('/', ticketController.list);
router.post('/', requireWriteAccess, ticketController.create);
router.get('/:id/articles/:articleId/attachments/:attachmentId', ticketController.downloadAttachment);
router.get('/:id', ticketController.getById);
router.patch('/:id', requireWriteAccess, ticketController.update);

module.exports = router;
