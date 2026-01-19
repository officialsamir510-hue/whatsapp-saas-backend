const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

// Protect routes - JWT Authentication
exports.protect = async (req, res, next) => {
    try {
        let token;

        // Get token from header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ error: 'Not authorized, no token' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        if (!user.isActive) {
            return res.status(401).json({ error: 'Account is deactivated' });
        }

        req.user = {
            id: user._id,
            email: user.email,
            role: user.role,
            tenant: user.tenant
        };

        next();
    } catch (error) {
        console.error('Auth Error:', error);
        res.status(401).json({ error: 'Not authorized, token failed' });
    }
};

// API Key Authentication (for external API access)
exports.apiKeyAuth = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({ error: 'API key required' });
        }

        const tenant = await Tenant.findOne({ apiKey: apiKey });

        if (!tenant) {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        if (!tenant.isActive) {
            return res.status(403).json({ error: 'Account suspended' });
        }

        req.tenant = tenant;
        req.user = { tenant: tenant._id };

        next();
    } catch (error) {
        res.status(500).json({ error: 'Authentication failed' });
    }
};

// Role-based access
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Not authorized to access this resource' 
            });
        }
        next();
    };
};

// Check plan features
exports.checkFeature = (feature) => {
    return async (req, res, next) => {
        try {
            const tenant = await Tenant.findById(req.user.tenant);
            const Plan = require('../models/Plan');
            const plan = await Plan.findOne({ slug: tenant.plan });

            if (!plan || !plan.features[feature]) {
                return res.status(403).json({ 
                    error: 'This feature is not available in your plan',
                    upgrade: true
                });
            }

            next();
        } catch (error) {
            res.status(500).json({ error: 'Feature check failed' });
        }
    };
};
