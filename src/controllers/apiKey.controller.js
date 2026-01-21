const ApiKey = require('../models/ApiKey');
const User = require('../models/User');

// ==================== CREATE API KEY ====================
exports.createApiKey = async (req, res) => {
    try {
        const { name, permissions } = req.body;
        const userId = req.user.id;
        const tenantId = req.user.tenantId;
        
        console.log('🔑 Creating API key for user:', userId);
        
        // Validation
        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'API key name is required'
            });
        }
        
        // Check user's plan limit
        const user = await User.findById(userId);
        const existingCount = await ApiKey.countDocuments({
            userId,
            isActive: true
        });
        
        if (existingCount >= user.planLimits.apiKeysLimit) {
            return res.status(403).json({
                success: false,
                message: `You can only create ${user.planLimits.apiKeysLimit} API key(s) on your ${user.plan} plan`,
                upgrade: true,
                limit: user.planLimits.apiKeysLimit,
                current: existingCount
            });
        }
        
        // Generate API key
        const key = ApiKey.generateKey();
        const keyHash = ApiKey.hashKey(key);
        
        // Default permissions
        const defaultPermissions = permissions || ['send_messages', 'view_analytics'];
        
        // Create API key
        const apiKey = await ApiKey.create({
            userId,
            tenantId,
            name: name.trim(),
            key,
            keyHash,
            permissions: defaultPermissions,
            isActive: true
        });
        
        console.log('✅ API key created:', apiKey.name);
        
        res.status(201).json({
            success: true,
            message: 'API key created successfully',
            data: {
                id: apiKey._id,
                name: apiKey.name,
                key, // ⚠️ Only shown once!
                permissions: apiKey.permissions,
                createdAt: apiKey.createdAt
            },
            warning: '⚠️ Save this key securely. It will not be shown again.'
        });
        
    } catch (error) {
        console.error('❌ Create API Key Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create API key',
            error: error.message
        });
    }
};

// ==================== GET ALL API KEYS ====================
exports.getApiKeys = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const apiKeys = await ApiKey.find({
            userId,
            isActive: true
        })
        .select('-key -keyHash') // Don't return actual key
        .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            data: apiKeys
        });
        
    } catch (error) {
        console.error('❌ Get API Keys Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch API keys',
            error: error.message
        });
    }
};

// ==================== UPDATE API KEY ====================
exports.updateApiKey = async (req, res) => {
    try {
        const { keyId } = req.params;
        const { name, permissions, isActive } = req.body;
        
        const apiKey = await ApiKey.findOne({
            _id: keyId,
            userId: req.user.id
        });
        
        if (!apiKey) {
            return res.status(404).json({
                success: false,
                message: 'API key not found'
            });
        }
        
        // Update fields
        if (name) apiKey.name = name.trim();
        if (permissions) apiKey.permissions = permissions;
        if (typeof isActive === 'boolean') apiKey.isActive = isActive;
        
        await apiKey.save();
        
        console.log('✅ API key updated:', keyId);
        
        res.json({
            success: true,
            message: 'API key updated successfully',
            data: {
                id: apiKey._id,
                name: apiKey.name,
                permissions: apiKey.permissions,
                isActive: apiKey.isActive
            }
        });
        
    } catch (error) {
        console.error('❌ Update API Key Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update API key',
            error: error.message
        });
    }
};

// ==================== DELETE API KEY ====================
exports.deleteApiKey = async (req, res) => {
    try {
        const { keyId } = req.params;
        
        const apiKey = await ApiKey.findOneAndDelete({
            _id: keyId,
            userId: req.user.id
        });
        
        if (!apiKey) {
            return res.status(404).json({
                success: false,
                message: 'API key not found'
            });
        }
        
        console.log('🗑️ API key deleted:', apiKey.name);
        
        res.json({
            success: true,
            message: 'API key deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ Delete API Key Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete API key',
            error: error.message
        });
    }
};

module.exports = exports;