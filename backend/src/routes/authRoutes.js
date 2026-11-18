const express = require('express');
const { requireAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();

router.get('/config', authController.publicConfig);
router.post('/login', authController.login);
router.post('/demo', authController.loginDemo);
router.post('/mode', requireAuth, authController.switchMode);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;
