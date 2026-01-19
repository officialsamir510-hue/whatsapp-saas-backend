const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    company: {
        type: String,
        default: ''
    },
    apiKey: {
        type: String,
        required: true,
        unique: true  // unique: true already creates index, no need for separate index
    },
    
    // ========= BILLING FIELDS =========
    plan: {
        type: String,
        enum: ['free', 'starter', 'professional', 'enterprise'],
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
    billingPeriod: {
        type: String,
        enum: ['monthly', 'yearly'],
        default: 'monthly'
    },
    subscriptionDate: {
        type: Date
    },
    subscriptionEndDate: {
        type: Date
    },
    lastPayment: {
        orderId: String,
        paymentId: String,
        amount: Number,
        date: Date,
        method: String
    },
    creditPurchases: [{
        orderId: String,
        paymentId: String,
        credits: Number,
        amount: Number,
        date: Date
    }],
    // ========= END BILLING FIELDS =========
    
    // WhatsApp Config
    whatsappConfig: {
        businessAccountId: String,
        phoneNumberId: String,
        phoneNumber: String,
        verifiedName: String,
        accessToken: String
    },
    webhookUrl: {
        type: String,
        default: ''
    },
    verifyToken: {
        type: String,
        default: 'wabmeta_whatsapp_1617'
    },
    facebookConnected: {
        type: Boolean,
        default: false
    },
    facebookConnectedAt: Date,
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ========= INDEXES =========
// Note: apiKey index is NOT needed here because unique: true already creates it
// tenantSchema.index({ apiKey: 1 }); ← REMOVED (duplicate)
tenantSchema.index({ plan: 1 });
tenantSchema.index({ subscriptionEndDate: 1 });

// ========= PRE-SAVE HOOK =========
tenantSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// ========= VIRTUAL FIELDS =========
// Check if subscription is active
tenantSchema.virtual('isSubscriptionActive').get(function() {
    if (this.plan === 'free') return true;
    if (!this.subscriptionEndDate) return false;
    return new Date(this.subscriptionEndDate) > new Date();
});

// Get days remaining in subscription
tenantSchema.virtual('subscriptionDaysRemaining').get(function() {
    if (this.plan === 'free') return null;
    if (!this.subscriptionEndDate) return 0;
    const diff = new Date(this.subscriptionEndDate) - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// ========= UTILITY METHODS =========
// Check if tenant has enough credits
tenantSchema.methods.hasEnoughCredits = function(required = 1) {
    return this.messageCredits >= required;
};

// Deduct credits when sending messages
tenantSchema.methods.deductCredits = async function(amount = 1) {
    if (!this.hasEnoughCredits(amount)) {
        throw new Error('Insufficient credits');
    }
    this.messageCredits -= amount;
    this.totalMessagesSent += amount;
    await this.save();
    return this.messageCredits;
};

// Add credits to account
tenantSchema.methods.addCredits = async function(amount) {
    this.messageCredits += amount;
    await this.save();
    return this.messageCredits;
};

// Upgrade plan
tenantSchema.methods.upgradePlan = async function(planId, billingPeriod, paymentDetails) {
    const PLAN_CREDITS = {
        free: 100,
        starter: 1000,
        professional: 5000,
        enterprise: 15000
    };

    this.plan = planId;
    this.billingPeriod = billingPeriod;
    this.messageCredits = PLAN_CREDITS[planId] || 100;
    this.subscriptionDate = new Date();
    
    // Set subscription end date based on billing period
    const daysToAdd = billingPeriod === 'yearly' ? 365 : 30;
    this.subscriptionEndDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
    
    // Save payment details
    if (paymentDetails) {
        this.lastPayment = {
            ...paymentDetails,
            date: new Date()
        };
    }
    
    await this.save();
    return this;
};

module.exports = mongoose.model('Tenant', tenantSchema);