const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    tenant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true
    },
    
    // WhatsApp Message ID
    waMessageId: {
        type: String,
        index: true
    },
    
    // Conversation
    conversationId: String,
    
    // Sender/Receiver
    from: {
        type: String,
        required: true
    },
    to: {
        type: String,
        required: true
    },
    
    // Direction
    direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        required: true
    },
    
    // Message Type
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'template', 'interactive', 'reaction'],
        default: 'text'
    },
    
    // Content based on type
    content: {
        text: String,
        caption: String,
        mediaUrl: String,
        mediaId: String,
        mimeType: String,
        fileName: String,
        
        // Template
        templateName: String,
        templateLanguage: String,
        templateComponents: mongoose.Schema.Types.Mixed,
        
        // Interactive
        interactive: mongoose.Schema.Types.Mixed,
        
        // Location
        location: {
            latitude: Number,
            longitude: Number,
            name: String,
            address: String
        },
        
        // Reaction
        reaction: {
            emoji: String,
            messageId: String
        }
    },
    
    // Status
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
        default: 'pending'
    },
    
    // Error details if failed
    error: {
        code: String,
        message: String
    },
    
    // Timestamps from WhatsApp
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,
    
    // Context (for replies)
    context: {
        messageId: String,
        from: String
    },
    
    // Metadata
    metadata: mongoose.Schema.Types.Mixed
}, {
    timestamps: true
});

// Indexes for faster queries
messageSchema.index({ tenant: 1, createdAt: -1 });
messageSchema.index({ tenant: 1, from: 1 });
messageSchema.index({ tenant: 1, to: 1 });
messageSchema.index({ tenant: 1, status: 1 });

module.exports = mongoose.model('Message', messageSchema);