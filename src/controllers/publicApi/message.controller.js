const Message = require('../../models/Message');
const WhatsAppAccount = require('../../models/WhatsAppAccount');
const User = require('../../models/User');
const axios = require('axios');

const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ==================== SEND SINGLE MESSAGE ====================
exports.sendMessage = async (req, res) => {
    try {
        const {
            to,              // WhatsApp number (with country code, no +)
            type,            // 'text', 'image', 'video', 'document', 'audio', 'template'
            message,         // For text messages
            media,           // For media messages { url, caption, filename }
            template         // For template messages { name, language, components }
        } = req.body;
        
        console.log('📤 Send message request:', { to, type });
        
        // Validation
        if (!to) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: to',
                message: 'Recipient phone number is required'
            });
        }
        
        if (!type) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: type',
                message: 'Message type is required'
            });
        }
        
        // Validate phone number format (10-15 digits)
        if (!/^\d{10,15}$/.test(to)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number format',
                message: 'Phone number must be 10-15 digits without + or spaces (e.g., 919876543210)'
            });
        }
        
        // Get user's active WhatsApp account
        const wabaAccount = await WhatsAppAccount.findOne({
            userId: req.user._id,
            status: 'active'
        }).select('+accessToken');
        
        if (!wabaAccount) {
            return res.status(404).json({
                success: false,
                error: 'No active WhatsApp account found',
                message: 'Please connect your WhatsApp Business account first',
                action: 'Visit dashboard to connect your account'
            });
        }
        
        // Get default phone number
        const phoneToUse = wabaAccount.phoneNumbers.find(
            p => p.isDefault && p.status === 'active'
        );
        
        if (!phoneToUse) {
            return res.status(400).json({
                success: false,
                error: 'No active phone number available',
                message: 'Please configure a default phone number in your dashboard'
            });
        }
        
        // Build Meta API payload
        let payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: type
        };
        
        // Add content based on type
        switch (type) {
            case 'text':
                if (!message) {
                    return res.status(400).json({
                        success: false,
                        error: 'Message text is required for type: text'
                    });
                }
                payload.text = {
                    preview_url: false,
                    body: message
                };
                break;
                
            case 'image':
            case 'video':
            case 'document':
                if (!media || !media.url) {
                    return res.status(400).json({
                        success: false,
                        error: `Media URL is required for type: ${type}`
                    });
                }
                payload[type] = {
                    link: media.url
                };
                if (media.caption) {
                    payload[type].caption = media.caption;
                }
                if (type === 'document' && media.filename) {
                    payload[type].filename = media.filename;
                }
                break;
                
            case 'audio':
                if (!media || !media.url) {
                    return res.status(400).json({
                        success: false,
                        error: 'Audio URL is required for type: audio'
                    });
                }
                payload.audio = { link: media.url };
                break;
                
            case 'template':
                if (!template || !template.name) {
                    return res.status(400).json({
                        success: false,
                        error: 'Template name is required for type: template'
                    });
                }
                payload.template = {
                    name: template.name,
                    language: {
                        code: template.language || 'en'
                    }
                };
                if (template.components) {
                    payload.template.components = template.components;
                }
                break;
                
            default:
                return res.status(400).json({
                    success: false,
                    error: `Invalid message type: ${type}`,
                    message: 'Supported types: text, image, video, document, audio, template'
                });
        }
        
        // Create message record
        const messageDoc = await Message.create({
            userId: req.user._id,
            tenantId: req.tenant._id,
            wabaId: wabaAccount.wabaId,
            phoneNumberId: phoneToUse.phoneNumberId,
            to: to,
            type: type,
            content: {
                ...(message && { text: message }),
                ...(media && media),
                ...(template && template)
            },
            status: 'queued',
            direction: 'outbound'
        });
        
        // Send via Meta API
        try {
            console.log('📡 Sending to Meta API...');
            
            const response = await axios.post(
                `${META_API_BASE}/${phoneToUse.phoneNumberId}/messages`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${wabaAccount.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            // Update message with Meta's ID
            messageDoc.messageId = response.data.messages[0].id;
            messageDoc.status = 'sent';
            messageDoc.sentAt = new Date();
            messageDoc.statusHistory = [{
                status: 'sent',
                timestamp: new Date()
            }];
            await messageDoc.save();
            
            // Update user usage
            await User.findByIdAndUpdate(req.user._id, {
                $inc: { 'currentUsage.messagesSent': 1 }
            });
            
            console.log('✅ Message sent:', messageDoc.messageId);
            
            res.status(200).json({
                success: true,
                data: {
                    id: messageDoc._id,
                    messageId: messageDoc.messageId,
                    status: 'sent',
                    to: to,
                    type: type,
                    sentAt: messageDoc.sentAt
                }
            });
            
        } catch (sendError) {
            console.error('❌ Meta API error:', sendError.response?.data || sendError.message);
            
            // Update message status to failed
            messageDoc.status = 'failed';
            messageDoc.failedAt = new Date();
            messageDoc.errorMessage = sendError.response?.data?.error?.message || sendError.message;
            messageDoc.statusHistory = [{
                status: 'failed',
                timestamp: new Date(),
                error: messageDoc.errorMessage
            }];
            await messageDoc.save();
            
            return res.status(500).json({
                success: false,
                error: 'Failed to send message',
                details: sendError.response?.data?.error || { message: sendError.message },
                messageId: messageDoc._id
            });
        }
        
    } catch (error) {
        console.error('❌ Send Message Error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

// ==================== GET MESSAGE STATUS ====================
exports.getMessageStatus = async (req, res) => {
    try {
        const { messageId } = req.params;
        
        const message = await Message.findOne({
            _id: messageId,
            userId: req.user._id
        });
        
        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }
        
        res.json({
            success: true,
            data: {
                id: message._id,
                messageId: message.messageId,
                status: message.status,
                to: message.to,
                type: message.type,
                sentAt: message.sentAt,
                deliveredAt: message.deliveredAt,
                readAt: message.readAt,
                failedAt: message.failedAt,
                errorMessage: message.errorMessage
            }
        });
        
    } catch (error) {
        console.error('❌ Get Status Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch message status',
            message: error.message
        });
    }
};

// ==================== GET MESSAGE HISTORY ====================
exports.getMessageHistory = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            status,
            type,
            startDate,
            endDate
        } = req.query;
        
        // Build query
        const query = { userId: req.user._id };
        
        if (status) query.status = status;
        if (type) query.type = type;
        
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }
        
        // Fetch messages
        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .select('-content.text'); // Don't return full text for privacy
        
        const total = await Message.countDocuments(query);
        
        res.json({
            success: true,
            data: {
                messages,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Get History Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch message history',
            message: error.message
        });
    }
};

module.exports = exports;