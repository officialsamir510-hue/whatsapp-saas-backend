const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    tenant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true
    },
    
    // WhatsApp ID (phone number)
    waId: {
        type: String,
        required: true
    },
    
    // Profile
    name: String,
    profileName: String, // From WhatsApp
    phone: {
        type: String,
        required: true
    },
    email: String,
    
    // Custom fields
    customFields: mongoose.Schema.Types.Mixed,
    
    // Tags for segmentation
    tags: [{
        type: String,
        trim: true
    }],
    
    // Conversation stats
    stats: {
        totalMessages: { type: Number, default: 0 },
        lastMessageAt: Date,
        firstMessageAt: Date
    },
    
    // Opt-in status
    optIn: {
        status: { type: Boolean, default: true },
        timestamp: Date,
        source: String
    },
    
    // Notes
    notes: String,
    
    // Status
    isBlocked: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Compound index for tenant + waId uniqueness
contactSchema.index({ tenant: 1, waId: 1 }, { unique: true });
contactSchema.index({ tenant: 1, tags: 1 });

module.exports = mongoose.model('Contact', contactSchema);