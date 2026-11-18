const express = require('express');
const { requireAuth } = require('../middleware/auth');
const auditController = require('../controllers/auditController');

const router = express.Router();

router.use(requireAuth);
router.get('/', auditController.listAuditLogs);

module.exports = router;
