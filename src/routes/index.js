const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const messageRoutes = require('./messageRoutes');
const contactRoutes = require('./contactRoutes');
const templateRoutes = require('./templateRoutes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/messages', messageRoutes);
router.use('/contacts', contactRoutes);
router.use('/templates', templateRoutes);

// Health check
router.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

module.exports = router;