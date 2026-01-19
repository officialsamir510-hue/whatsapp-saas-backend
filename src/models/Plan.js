const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    slug: {
        type: String,
        required: true,
        unique: true
    },
    description: String,
    
    // Pricing
    price: {
        monthly: { type: Number, required: true },
        yearly: { type: Number, required: true }
    },
    currency: {
        type: String,
        default: 'INR'
    },
    
    // Features
    features: {
        messagesPerMonth: { type: Number, required: true },
        contacts: { type: Number, default: -1 }, // -1 = unlimited
        users: { type: Number, default: 1 },
        templates: { type: Number, default: 10 },
        
        // Feature flags
        hasApi: { type: Boolean, default: false },
        hasWebhooks: { type: Boolean, default: false },
        hasBroadcast: { type: Boolean, default: false },
        hasAutoReply: { type: Boolean, default: false },
        hasChatbot: { type: Boolean, default: false },
        hasAnalytics: { type: Boolean, default: false },
        hasExport: { type: Boolean, default: false },
        hasWhiteLabel: { type: Boolean, default: false },
        
        // Support
        supportLevel: {
            type: String,
            enum: ['community', 'email', 'priority', 'dedicated'],
            default: 'community'
        }
    },
    
    // Display
    isPopular: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

module.exports = mongoose.model('Plan', planSchema);