const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Webhook verification (GET) - No authentication needed
router.get('/', webhookController.verify);

// Webhook handler (POST) - Signature verification in controller
router.post('/', express.json({ 
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}), webhookController.handleWebhook);

module.exports = router;