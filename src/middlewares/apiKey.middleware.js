const ApiKey = require('../models/ApiKey');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

// ==================== API KEY AUTHENTICATION ====================
const apiKeyAuth = async (req, res, next) => {
    try {
        // Get API key from header
        const apiKey = req.headers['x-api-key'] || 
                      req.headers['authorization']?.replace('Bearer ', '');
        
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'API key is required',
                message: 'Include your API key in X-API-Key header or Authorization: Bearer header',
                docs: 'https://your-domain.com/api-docs'
            });
        }
        
        // Validate format
        if (!apiKey.startsWith('wsp_')) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key format',
                message: 'API key must start with wsp_'
            });
        }
        
        // Hash and find
        const keyHash = ApiKey.hashKey(apiKey);
        
        const apiKeyDoc = await ApiKey.findOne({
            keyHash,
            isActive: true
        }).select('+keyHash');
        
        if (!apiKeyDoc) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or inactive API key',
                message: 'Please check your API key or generate a new one'
            });
        }
        
        // Get user & tenant
        const user = await User.findById(apiKeyDoc.userId);
        const tenant = await Tenant.findById(apiKeyDoc.tenantId);
        
        if (!user || !user.isActive) {
            return res.status(403).json({
                success: false,
                error: 'User account is inactive'
            });
        }
        
        if (!tenant || !tenant.isActive) {
            return res.status(403).json({
                success: false,
                error: 'Tenant account is suspended'
            });
        }
        
        // Check plan limits
        if (user.currentUsage.messagesSent >= user.planLimits.messagesPerMonth) {
            return res.status(429).json({
                success: false,
                error: 'Monthly message limit exceeded',
                limit: user.planLimits.messagesPerMonth,
                used: user.currentUsage.messagesSent,
                message: 'Please upgrade your plan or wait for next billing cycle'
            });
        }
        
        // Update last used (non-blocking)
        apiKeyDoc.lastUsedAt = new Date();
        apiKeyDoc.totalRequests += 1;
        apiKeyDoc.save().catch(err => console.error('Failed to update API key usage:', err));
        
        // Attach to request
        req.user = user;
        req.tenant = tenant;
        req.apiKey = apiKeyDoc;
        
        next();
        
    } catch (error) {
        console.error('❌ API Key Auth Error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication failed',
            message: error.message
        });
    }
};

module.exports = { apiKeyAuth };