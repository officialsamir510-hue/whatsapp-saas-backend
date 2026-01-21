const mongoose = require('mongoose');
const crypto = require('crypto');

const apiKeySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true
    },
    
    name: {
        type: String,
        required: true
    },
    
    key: {
        type: String,
        required: true,
        unique: true
    },
    
    keyHash: {
        type: String,
        required: true,
        select: false
    },
    
    permissions: [{
        type: String,
        enum: ['send_messages', 'manage_templates', 'manage_contacts', 'view_analytics']
    }],
    
    isActive: {
        type: Boolean,
        default: true
    },
    
    lastUsedAt: Date,
    totalRequests: {
        type: Number,
        default: 0
    }
    
}, { timestamps: true });

apiKeySchema.index({ key: 1 });
apiKeySchema.index({ userId: 1, isActive: 1 });

// Generate API key
apiKeySchema.statics.generateKey = function() {
    return `wsp_${crypto.randomBytes(32).toString('hex')}`;
};

// Hash API key
apiKeySchema.statics.hashKey = function(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
};

module.exports = mongoose.model('ApiKey', apiKeySchema);