const rateLimit = require('express-rate-limit');

// Rate limiter for payment endpoints
const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many payment attempts, please try again later'
});

// Validate Razorpay webhook
const validateWebhook = (req, res, next) => {
    const shasum = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');

    if (digest !== req.headers['x-razorpay-signature']) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    next();
};

module.exports = {
    paymentLimiter,
    validateWebhook
};