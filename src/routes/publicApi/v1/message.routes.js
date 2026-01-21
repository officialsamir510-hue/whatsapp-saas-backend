const express = require('express');
const router = express.Router();

// Public API uses API key, not JWT
const { apiKeyAuth } = require('../../../middleware/apiKey.middleware');

const {
    sendMessage,
    getMessageStatus,
    getMessageHistory
} = require('../../../controllers/publicApi/message.controller');

// All routes require API key
router.use(apiKeyAuth);

router.post('/send', sendMessage);
router.get('/:messageId/status', getMessageStatus);
router.get('/history', getMessageHistory);

module.exports = router;