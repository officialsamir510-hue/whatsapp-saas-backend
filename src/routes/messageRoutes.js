const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

// Debug log
console.log('Message Controller exports:', Object.keys(messageController));

router.get('/', protect, messageController.getMessages);
router.post('/send', protect, messageController.sendMessage);
router.post('/broadcast', protect, messageController.broadcast);

module.exports = router;