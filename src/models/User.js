const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // ==================== BASIC INFO ====================
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    
    // ==================== TENANT & ROLE ====================
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true
    },
    role: {
        type: String,
        enum: ['owner', 'admin', 'agent', 'super_admin'],
        default: 'owner'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isSuperAdmin: {
        type: Boolean,
        default: false
    },
    permissions: {
        type: [String],
        default: []
    },
    
    // ==================== PLAN & LIMITS ====================
    plan: {
        type: String,
        enum: ['free', 'starter', 'professional', 'enterprise'],
        default: 'free'
    },
    
    planLimits: {
        messagesPerMonth: { 
            type: Number, 
            default: 1000 
        },
        apiKeysLimit: { 
            type: Number, 
            default: 2 
        },
        whatsappAccountsLimit: { 
            type: Number, 
            default: 1 
        },
        templatesLimit: { 
            type: Number, 
            default: 5 
        },
        contactsLimit: { 
            type: Number, 
            default: 1000 
        },
        apiCallsPerMinute: { 
            type: Number, 
            default: 10 
        }
    },
    
    // ==================== CURRENT USAGE ====================
    currentUsage: {
        messagesSent: { 
            type: Number, 
            default: 0 
        },
        apiCallsMade: { 
            type: Number, 
            default: 0 
        },
        lastResetDate: { 
            type: Date, 
            default: Date.now 
        }
    },
    
    // ==================== BILLING ====================
    stripeCustomerId: String,
    razorpayCustomerId: String,
    
    // ==================== TIMESTAMPS ====================
    lastLogin: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
    
}, {
    timestamps: true
});

// ==================== INDEXES ====================
userSchema.index({ email: 1 });
userSchema.index({ tenantId: 1 });
userSchema.index({ plan: 1 });

// ==================== METHODS ====================

// Reset monthly usage (call this on billing cycle)
userSchema.methods.resetMonthlyUsage = function() {
    this.currentUsage.messagesSent = 0;
    this.currentUsage.apiCallsMade = 0;
    this.currentUsage.lastResetDate = new Date();
    return this.save();
};

// Check if user has reached message limit
userSchema.methods.hasReachedMessageLimit = function() {
    return this.currentUsage.messagesSent >= this.planLimits.messagesPerMonth;
};

// Check if user can create more API keys
userSchema.methods.canCreateApiKey = async function() {
    const ApiKey = mongoose.model('ApiKey');
    const count = await ApiKey.countDocuments({
        userId: this._id,
        isActive: true
    });
    return count < this.planLimits.apiKeysLimit;
};

// Update plan and limits
userSchema.methods.updatePlan = function(newPlan) {
    const planLimits = {
        free: {
            messagesPerMonth: 1000,
            apiKeysLimit: 2,
            whatsappAccountsLimit: 1,
            templatesLimit: 5,
            contactsLimit: 1000,
            apiCallsPerMinute: 10
        },
        starter: {
            messagesPerMonth: 10000,
            apiKeysLimit: 5,
            whatsappAccountsLimit: 2,
            templatesLimit: 20,
            contactsLimit: 5000,
            apiCallsPerMinute: 30
        },
        professional: {
            messagesPerMonth: 50000,
            apiKeysLimit: 10,
            whatsappAccountsLimit: 5,
            templatesLimit: 50,
            contactsLimit: 25000,
            apiCallsPerMinute: 100
        },
        enterprise: {
            messagesPerMonth: 500000,
            apiKeysLimit: 50,
            whatsappAccountsLimit: 20,
            templatesLimit: 200,
            contactsLimit: 100000,
            apiCallsPerMinute: 500
        }
    };
    
    this.plan = newPlan;
    this.planLimits = planLimits[newPlan];
    return this.save();
};

// ==================== STATICS ====================

// Get plan details
userSchema.statics.getPlanDetails = function() {
    return {
        free: {
            name: 'Free',
            price: 0,
            features: {
                messagesPerMonth: 1000,
                apiKeysLimit: 2,
                whatsappAccountsLimit: 1,
                templatesLimit: 5,
                contactsLimit: 1000,
                apiCallsPerMinute: 10,
                support: 'Community'
            }
        },
        starter: {
            name: 'Starter',
            price: 999,
            features: {
                messagesPerMonth: 10000,
                apiKeysLimit: 5,
                whatsappAccountsLimit: 2,
                templatesLimit: 20,
                contactsLimit: 5000,
                apiCallsPerMinute: 30,
                support: 'Email'
            }
        },
        professional: {
            name: 'Professional',
            price: 4999,
            features: {
                messagesPerMonth: 50000,
                apiKeysLimit: 10,
                whatsappAccountsLimit: 5,
                templatesLimit: 50,
                contactsLimit: 25000,
                apiCallsPerMinute: 100,
                support: 'Priority Email + Chat'
            }
        },
        enterprise: {
            name: 'Enterprise',
            price: 19999,
            features: {
                messagesPerMonth: 500000,
                apiKeysLimit: 50,
                whatsappAccountsLimit: 20,
                templatesLimit: 200,
                contactsLimit: 100000,
                apiCallsPerMinute: 500,
                support: 'Dedicated Support'
            }
        }
    };
};

module.exports = mongoose.model('User', userSchema);