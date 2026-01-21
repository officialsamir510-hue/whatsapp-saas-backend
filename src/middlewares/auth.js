const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

console.log('🔄 Loading auth middleware...');

// ============================================
// JWT TOKEN AUTHENTICATION (for Dashboard)
// ============================================
const protect = async (req, res, next) => {
    try {
        let token;

        // Check for token in headers
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            console.log('❌ No token provided');
            return res.status(401).json({
                success: false,
                message: 'Not authorized, no token provided'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        console.log('✅ Token verified for user:', decoded.id);

        // Get user from token
        const user = await User.findById(decoded.id);

        if (!user) {
            console.log('❌ User not found from token');
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        // Attach user info to request
        req.user = {
            id: user._id,
            _id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            tenantId: user.tenantId,
            isSuperAdmin: user.isSuperAdmin || false,
            plan: user.plan,
            planLimits: user.planLimits
        };

        next();
    } catch (error) {
        console.error('❌ Token verification failed:', error.message);

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired, please login again'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        return res.status(401).json({
            success: false,
            message: 'Not authorized'
        });
    }
};

// Alias
const authenticateToken = protect;

// ============================================
// API KEY AUTHENTICATION (for External API)
// ============================================
const apiKeyAuth = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API_KEY_REQUIRED',
                message: 'API key is required'
            });
        }

        const tenant = await Tenant.findOne({ apiKey });

        if (!tenant) {
            return res.status(401).json({
                success: false,
                error: 'INVALID_API_KEY',
                message: 'Invalid API key'
            });
        }

        if (!tenant.isActive) {
            return res.status(403).json({
                success: false,
                error: 'ACCOUNT_SUSPENDED',
                message: 'Account suspended'
            });
        }

        const user = await User.findOne({ tenantId: tenant._id, role: 'owner' });

        req.tenant = tenant;
        req.apiKeyUser = user;
        req.user = {
            id: user?._id,
            tenantId: tenant._id,
            plan: user?.plan || 'free',
            planLimits: user?.planLimits
        };

        next();
    } catch (error) {
        console.error('❌ API Key auth failed:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

const authenticateApiKey = apiKeyAuth;

// ============================================
// ROLE-BASED ACCESS
// ============================================
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        next();
    };
};

// Admin only
const admin = (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'owner' && !req.user.isSuperAdmin)) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
};

// Super admin only
const superAdminOnly = (req, res, next) => {
    if (!req.user?.isSuperAdmin) {
        return res.status(403).json({ success: false, message: 'Super admin required' });
    }
    next();
};

// ============================================
// CHECK PLAN FEATURE
// ============================================
const checkFeature = (feature) => {
    return async (req, res, next) => {
        try {
            if (!req.user?.id) return next();
            
            const user = await User.findById(req.user.id);
            if (!user) return next();

            const limits = user.planLimits || {};
            const usage = user.currentUsage || {};

            const checks = {
                messages: () => usage.messagesSent >= limits.messagesPerMonth,
                apiKeys: async () => {
                    try {
                        const ApiKey = require('../models/ApiKey');
                        const count = await ApiKey.countDocuments({ userId: user._id, isActive: true });
                        return count >= limits.apiKeysLimit;
                    } catch { return false; }
                },
                whatsappAccounts: async () => {
                    const tenant = await Tenant.findById(user.tenantId);
                    return (tenant?.whatsappAccounts?.length || 0) >= limits.whatsappAccountsLimit;
                },
                templates: async () => {
                    try {
                        const Template = require('../models/Template');
                        const count = await Template.countDocuments({ tenantId: user.tenantId });
                        return count >= limits.templatesLimit;
                    } catch { return false; }
                },
                contacts: async () => {
                    try {
                        const Contact = require('../models/Contact');
                        const count = await Contact.countDocuments({ tenantId: user.tenantId });
                        return count >= limits.contactsLimit;
                    } catch { return false; }
                }
            };

            if (checks[feature]) {
                const limitReached = await checks[feature]();
                if (limitReached) {
                    return res.status(403).json({
                        success: false,
                        message: `${feature} limit reached`,
                        upgrade: true
                    });
                }
            }

            next();
        } catch (error) {
            next();
        }
    };
};

// ============================================
// RATE LIMITING
// ============================================
const rateLimitMap = new Map();

const rateLimit = (maxRequests = 100, windowMs = 60000) => {
    return (req, res, next) => {
        const key = req.user?.id?.toString() || req.ip;
        const now = Date.now();
        
        const record = rateLimitMap.get(key);
        
        if (!record || now - record.startTime > windowMs) {
            rateLimitMap.set(key, { count: 1, startTime: now });
            return next();
        }
        
        if (record.count >= maxRequests) {
            return res.status(429).json({
                success: false,
                message: 'Too many requests'
            });
        }
        
        record.count++;
        next();
    };
};

// ============================================
// OPTIONAL AUTH
// ============================================
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            const user = await User.findById(decoded.id);
            if (user?.isActive) {
                req.user = {
                    id: user._id,
                    email: user.email,
                    role: user.role,
                    tenantId: user.tenantId,
                    isSuperAdmin: user.isSuperAdmin || false
                };
            }
        }
    } catch {}
    next();
};

console.log('✅ Auth middleware loaded');

module.exports = {
    protect,
    authenticateToken,
    apiKeyAuth,
    authenticateApiKey,
    authorize,
    admin,
    superAdminOnly,
    checkFeature,
    rateLimit,
    optionalAuth
};