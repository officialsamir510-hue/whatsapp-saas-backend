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

        // Check if token exists
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

        // Check if user is active
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

// Alias for protect (for compatibility)
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
                message: 'API key is required. Include X-API-Key header.'
            });
        }

        // Find tenant by API key
        const tenant = await Tenant.findOne({ apiKey: apiKey });

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
                message: 'Account is suspended'
            });
        }

        // Find user (owner) of the tenant
        const user = await User.findOne({ tenantId: tenant._id, role: 'owner' });

        // Attach to request
        req.tenant = tenant;
        req.apiKeyUser = user;
        req.user = {
            id: user?._id,
            tenantId: tenant._id,
            plan: user?.plan || tenant.plan || 'free',
            planLimits: user?.planLimits
        };

        // Update API key usage
        // You can add rate limiting logic here

        next();
    } catch (error) {
        console.error('❌ API Key auth failed:', error);
        res.status(500).json({
            success: false,
            error: 'AUTH_FAILED',
            message: 'Authentication failed'
        });
    }
};

// Alias for apiKeyAuth
const authenticateApiKey = apiKeyAuth;

// ============================================
// ROLE-BASED ACCESS CONTROL
// ============================================
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Role '${req.user.role}' is not authorized to access this resource`
            });
        }

        next();
    };
};

// ============================================
// SUPER ADMIN ONLY
// ============================================
const superAdminOnly = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Not authenticated'
        });
    }

    if (!req.user.isSuperAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Super admin access required'
        });
    }

    next();
};

// ============================================
// CHECK PLAN FEATURE
// ============================================
const checkFeature = (feature) => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.tenantId) {
                return res.status(401).json({
                    success: false,
                    message: 'Not authenticated'
                });
            }

            const user = await User.findById(req.user.id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Check plan limits based on feature
            const limits = user.planLimits || {};
            
            switch (feature) {
                case 'messages':
                    if (user.currentUsage?.messagesSent >= limits.messagesPerMonth) {
                        return res.status(403).json({
                            success: false,
                            message: 'Monthly message limit reached',
                            upgrade: true
                        });
                    }
                    break;
                    
                case 'apiKeys':
                    const ApiKey = require('../models/ApiKey');
                    const keyCount = await ApiKey.countDocuments({ 
                        userId: user._id, 
                        isActive: true 
                    });
                    if (keyCount >= limits.apiKeysLimit) {
                        return res.status(403).json({
                            success: false,
                            message: 'API key limit reached',
                            upgrade: true
                        });
                    }
                    break;
                    
                case 'whatsappAccounts':
                    const tenant = await Tenant.findById(user.tenantId);
                    const accountCount = tenant?.whatsappAccounts?.length || 0;
                    if (accountCount >= limits.whatsappAccountsLimit) {
                        return res.status(403).json({
                            success: false,
                            message: 'WhatsApp account limit reached',
                            upgrade: true
                        });
                    }
                    break;
                    
                case 'templates':
                    const Template = require('../models/Template');
                    const templateCount = await Template.countDocuments({ 
                        tenantId: user.tenantId 
                    });
                    if (templateCount >= limits.templatesLimit) {
                        return res.status(403).json({
                            success: false,
                            message: 'Template limit reached',
                            upgrade: true
                        });
                    }
                    break;
                    
                case 'contacts':
                    const Contact = require('../models/Contact');
                    const contactCount = await Contact.countDocuments({ 
                        tenantId: user.tenantId 
                    });
                    if (contactCount >= limits.contactsLimit) {
                        return res.status(403).json({
                            success: false,
                            message: 'Contact limit reached',
                            upgrade: true
                        });
                    }
                    break;
            }

            next();
        } catch (error) {
            console.error('Feature check error:', error);
            // If model doesn't exist, allow the request
            next();
        }
    };
};

// ============================================
// RATE LIMITING (Simple version)
// ============================================
const rateLimitMap = new Map();

const rateLimit = (maxRequests = 100, windowMs = 60000) => {
    return (req, res, next) => {
        const key = req.user?.id || req.ip;
        const now = Date.now();
        
        if (!rateLimitMap.has(key)) {
            rateLimitMap.set(key, { count: 1, startTime: now });
            return next();
        }
        
        const record = rateLimitMap.get(key);
        
        // Reset if window expired
        if (now - record.startTime > windowMs) {
            rateLimitMap.set(key, { count: 1, startTime: now });
            return next();
        }
        
        // Check limit
        if (record.count >= maxRequests) {
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests, please try again later'
            });
        }
        
        record.count++;
        next();
    };
};

// ============================================
// OPTIONAL AUTH (doesn't fail if no token)
// ============================================
const optionalAuth = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            const user = await User.findById(decoded.id);
            
            if (user && user.isActive) {
                req.user = {
                    id: user._id,
                    email: user.email,
                    role: user.role,
                    tenantId: user.tenantId,
                    isSuperAdmin: user.isSuperAdmin || false
                };
            }
        }
        
        next();
    } catch (error) {
        // Token invalid, but continue without user
        next();
    }
};

console.log('✅ Auth middleware loaded');

// ============================================
// EXPORT ALL MIDDLEWARE
// ============================================
module.exports = {
    // Main auth
    protect,
    authenticateToken,
    
    // API Key auth
    apiKeyAuth,
    authenticateApiKey,
    
    // Role-based
    authorize,
    superAdminOnly,
    
    // Feature checks
    checkFeature,
    
    // Rate limiting
    rateLimit,
    
    // Optional auth
    optionalAuth
};