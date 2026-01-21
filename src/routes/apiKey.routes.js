const express = require('express');
const router = express.Router();
// ✅ CORRECT (same as your existing routes)
const { authenticateToken } = require('../middleware/auth');
const {
    createApiKey,
    getApiKeys,
    updateApiKey,
    deleteApiKey
} = require('../controllers/apiKey.controller');

// All routes require authentication
router.use(authenticateToken);

// CRUD operations
router.post('/', createApiKey);
router.get('/', getApiKeys);
router.put('/:keyId', updateApiKey);
router.delete('/:keyId', deleteApiKey);

module.exports = router;