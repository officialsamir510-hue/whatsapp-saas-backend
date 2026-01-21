const mongoose = require('mongoose');

const whatsAppAccountSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true
    },
    
    // Meta OAuth Data
    wabaId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    businessId: {
        type: String,
        required: true
    },
    
    accessToken: {
        type: String,
        required: true,
        select: false // Don't return by default
    },
    
    // Phone numbers linked to this WABA
    phoneNumbers: [{
        phoneNumberId: {
            type: String,
            required: true
        },
        displayPhoneNumber: String,
        verifiedName: String,
        qualityRating: {
            type: String,
            enum: ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'],
            default: 'UNKNOWN'
        },
        isDefault: {
            type: Boolean,
            default: false
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active'
        }
    }],
    
    // Account details
    accountName: String,
    timezone: String,
    currency: String,
    
    // Status
    status: {
        type: String,
        enum: ['active', 'disconnected', 'suspended', 'limited'],
        default: 'active',
        index: true
    },
    
    // Token management
    tokenExpiresAt: Date,
    lastSyncedAt: Date,
    
    // Permissions granted during OAuth
    permissions: [String],
    
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
whatsAppAccountSchema.index({ userId: 1, status: 1 });
whatsAppAccountSchema.index({ tenantId: 1 });

// Virtual for default phone
whatsAppAccountSchema.virtual('defaultPhone').get(function() {
    return this.phoneNumbers.find(p => p.isDefault) || this.phoneNumbers[0];
});

module.exports = mongoose.model('WhatsAppAccount', whatsAppAccountSchema);