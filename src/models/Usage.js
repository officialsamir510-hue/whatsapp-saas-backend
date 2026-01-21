const mongoose = require('mongoose');

const usageSchema = new mongoose.Schema({
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
    
    month: {
        type: String, // Format: "2024-01"
        required: true
    },
    
    // Message usage
    messagesSent: { type: Number, default: 0 },
    messagesDelivered: { type: Number, default: 0 },
    messagesFailed: { type: Number, default: 0 },
    
    // API usage
    apiCalls: { type: Number, default: 0 },
    
    // Breakdown by type
    messagesByType: {
        text: { type: Number, default: 0 },
        template: { type: Number, default: 0 },
        media: { type: Number, default: 0 }
    },
    
    // Cost tracking (if needed)
    totalCost: { type: Number, default: 0 },
    
    // Daily breakdown
    dailyUsage: [{
        date: Date,
        messages: Number,
        apiCalls: Number,
        cost: Number
    }],
    
}, { timestamps: true });

// Unique per user per month
usageSchema.index({ userId: 1, month: 1 }, { unique: true });
usageSchema.index({ tenantId: 1, month: 1 });

module.exports = mongoose.model('Usage', usageSchema);