// src/routes/metaOAuthRoutes.js

const express = require('express');
const router = express.Router();
const metaOAuthController = require('../controllers/metaOAuthController');
const authMiddleware = require('../middlewares/authMiddleware');

// Get OAuth URL
router.get('/connect', authMiddleware, metaOAuthController.getOAuthUrl);

// OAuth Callback
router.get('/callback', metaOAuthController.handleCallback);

// Get Status
router.get('/status', authMiddleware, metaOAuthController.getConnectionStatus);

// Disconnect
router.post('/disconnect', authMiddleware, metaOAuthController.disconnectWhatsApp);

module.exports = router;