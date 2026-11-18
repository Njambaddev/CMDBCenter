const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const settingsController = require('../controllers/settingsController');

const router = express.Router();

router.use(requireAuth);

router.get('/status', settingsController.getStatus);
router.post('/verify-znuny', settingsController.verifyZnuny);
router.post('/live-writes', requireRole('admin'), settingsController.toggleLiveWrites);
router.post('/clear-cache', settingsController.clearCache);

module.exports = router;
