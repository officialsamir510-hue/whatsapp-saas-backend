const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    company: {
        type: String,
        trim: true
    },
    apiKey: {
        type: String,
        required: true,
        unique: true
    },
    plan: {
        type: String,
        enum: ['free', 'basic', 'pro', 'enterprise', 'unlimited'],
        default: 'free'
    },
    messageCredits: {
        type: Number,
        default: 100
    },
    totalMessagesSent: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    facebookConnected: {
        type: Boolean,
        default: false
    },
    facebookConnectedAt: {
        type: Date
    },
    whatsappConfig: {
        accessToken: String,
        phoneNumberId: String,
        businessAccountId: String,
        wabaid: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

tenantSchema.index({ apiKey: 1 });

module.exports = mongoose.model('Tenant', tenantSchema);