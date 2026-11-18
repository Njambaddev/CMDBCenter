const express = require('express');
const { requireAuth } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

router.use(requireAuth);

router.get('/summary', dashboardController.getSummary);
router.get('/cmdb-statistics', dashboardController.getCmdbStats);
router.get('/ticket-statistics', dashboardController.getTicketStats);

module.exports = router;
