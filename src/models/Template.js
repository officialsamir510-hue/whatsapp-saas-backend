const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    tenant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    category: {
        type: String,
        enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
        default: 'MARKETING'
    },
    language: {
        type: String,
        default: 'en'
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED'],
        default: 'PENDING'
    },
    components: [{
        type: {
            type: String,
            enum: ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'],
            required: true
        },
        format: {
            type: String,
            enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']
        },
        text: String,
        example: mongoose.Schema.Types.Mixed
    }],
    waTemplateId: {
        type: String
    },
    rejectionReason: {
        type: String
    }
}, {
    timestamps: true
});

// Indexes
templateSchema.index({ tenant: 1, name: 1 }, { unique: true });
templateSchema.index({ tenant: 1, status: 1 });

module.exports = mongoose.model('Template', templateSchema);