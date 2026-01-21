const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    initOAuth,
    handleCallback,
    getAccounts,
    disconnectAccount,
    syncAccount,
    setDefaultPhone
} = require('../controllers/whatsappOAuth.controller');

// Initialize OAuth (protected - requires login)
router.get('/init', authenticateToken, initOAuth);

// OAuth callback (public - Meta redirects here)
router.get('/callback', handleCallback);

// Get connected accounts (protected)
router.get('/accounts', authenticateToken, getAccounts);

// Disconnect account (protected)
router.delete('/accounts/:wabaId', authenticateToken, disconnectAccount);

// Sync account data from Meta (protected)
router.post('/accounts/:wabaId/sync', authenticateToken, syncAccount);

// Set default phone number (protected)
router.put('/accounts/:wabaId/phone/:phoneNumberId/default', authenticateToken, setDefaultPhone);

module.exports = router;