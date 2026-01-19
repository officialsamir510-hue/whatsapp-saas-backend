const { body, validationResult } = require('express-validator');

// Validation error handler
exports.validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// Auth validators
exports.registerValidator = [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

exports.loginValidator = [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
];

// Message validators
exports.sendMessageValidator = [
    body('to').notEmpty().withMessage('Recipient phone number is required'),
    body('message').notEmpty().withMessage('Message is required')
];