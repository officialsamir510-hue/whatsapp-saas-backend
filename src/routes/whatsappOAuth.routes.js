const express = require('express');
const router = express.Router();

// ✅ CORRECT PATH (same as authRoutes.js)
const { authenticateToken } = require('../middleware/auth');

const {
    initOAuth,
    handleCallback,
    getAccounts,
    disconnectAccount,
    syncAccount,
    setDefaultPhone
} = require('../controllers/whatsappOAuth.controller');

// Routes
router.get('/init', authenticateToken, initOAuth);
router.get('/callback', handleCallback);
router.get('/accounts', authenticateToken, getAccounts);
router.delete('/accounts/:wabaId', authenticateToken, disconnectAccount);
router.post('/accounts/:wabaId/sync', authenticateToken, syncAccount);
router.put('/accounts/:wabaId/phone/:phoneNumberId/default', authenticateToken, setDefaultPhone);

module.exports = router;