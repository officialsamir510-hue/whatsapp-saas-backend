const mongoose = require('mongoose');

const whatsAppAccountSchema = new mongoose.Schema({
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
    
    // Meta OAuth Data
    wabaId: {
        type: String,
        required: true,
        unique: true
    },
    businessId: String,
    accessToken: {
        type: String,
        required: true,
        select: false
    },
    
    // Phone numbers
    phoneNumbers: [{
        phoneNumberId: String,
        displayPhoneNumber: String,
        verifiedName: String,
        qualityRating: String,
        isDefault: Boolean
    }],
    
    accountName: String,
    status: {
        type: String,
        enum: ['active', 'disconnected', 'suspended'],
        default: 'active'
    },
    
    tokenExpiresAt: Date,
    lastSyncedAt: Date
    
}, { timestamps: true });

whatsAppAccountSchema.index({ userId: 1, status: 1 });
whatsAppAccountSchema.index({ wabaId: 1 });

module.exports = mongoose.model('WhatsAppAccount', whatsAppAccountSchema);