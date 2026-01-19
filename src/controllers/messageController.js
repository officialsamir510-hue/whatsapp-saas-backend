const Message = require('../models/Message');
const Contact = require('../models/Contact');
const Tenant = require('../models/Tenant');
const whatsappService = require('../services/whatsappService');

// @desc    Get all messages
// @route   GET /api/messages
exports.getMessages = async (req, res) => {
    try {
        const { contact, page = 1, limit = 50 } = req.query;
        
        const query = { tenant: req.user.tenant };
        if (contact) {
            query.$or = [{ from: contact }, { to: contact }];
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Message.countDocuments(query);

        res.json({
            success: true,
            data: {
                messages,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
};

// @desc    Send a message
// @route   POST /api/messages/send
exports.sendMessage = async (req, res) => {
    try {
        const { to, message, type = 'text' } = req.body;

        if (!to || !message) {
            return res.status(400).json({ error: 'Recipient and message are required' });
        }

        const tenant = await Tenant.findById(req.user.tenant);
        
        if (!tenant.hasCredits(1)) {
            return res.status(402).json({ error: 'Insufficient credits' });
        }

        const result = await whatsappService.sendText(to, message);

        if (result.success) {
            await Message.create({
                tenant: tenant._id,
                waMessageId: result.data.messages[0].id,
                from: process.env.WHATSAPP_PHONE_NUMBER_ID,
                to: to,
                direction: 'outbound',
                type: type,
                content: { text: message },
                status: 'sent',
                sentAt: new Date()
            });

            tenant.messageCredits -= 1;
            tenant.totalMessagesSent += 1;
            await tenant.save();

            res.json({ success: true, data: result.data });
        } else {
            res.status(400).json({ error: 'Failed to send message', details: result.error });
        }
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
};

// @desc    Broadcast message to multiple recipients
// @route   POST /api/messages/broadcast
exports.broadcast = async (req, res) => {
    try {
        console.log('📢 Broadcast Request:', {
            recipients: req.body.recipients?.length,
            type: req.body.type
        });

        const { recipients, message, type = 'text', templateName, components, mediaUrl, mediaType, caption } = req.body;
        
        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({ error: 'Recipients array is required' });
        }

        const tenant = await Tenant.findById(req.user.tenant);

        if (!tenant.hasCredits(recipients.length)) {
            return res.status(402).json({ 
                error: 'Insufficient credits',
                required: recipients.length,
                available: tenant.messageCredits
            });
        }

        const results = {
            success: [],
            failed: []
        };

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i].toString().replace(/[\s\-\+\(\)]/g, '');
            
            try {
                let result;
                
                switch (type) {
                    case 'template':
                        result = await whatsappService.sendTemplate(recipient, templateName, 'en', components || []);
                        break;
                    
                    case 'media':
                        if (mediaType === 'image') {
                            result = await whatsappService.sendImage(recipient, mediaUrl, caption);
                        } else if (mediaType === 'video') {
                            result = await whatsappService.sendVideo(recipient, mediaUrl, caption);
                        } else if (mediaType === 'document') {
                            result = await whatsappService.sendDocument(recipient, mediaUrl, 'document', caption);
                        } else {
                            result = await whatsappService.sendImage(recipient, mediaUrl, caption);
                        }
                        break;
                    
                    case 'text':
                    default:
                        let personalizedMessage = message;
                        const contact = await Contact.findOne({ tenant: tenant._id, waId: recipient });
                        if (contact) {
                            personalizedMessage = message
                                .replace(/\{\{name\}\}/gi, contact.name || 'Customer')
                                .replace(/\{\{1\}\}/g, contact.name || 'Customer');
                        }
                        personalizedMessage = personalizedMessage
                            .replace(/\{\{company\}\}/gi, tenant.name || 'Company')
                            .replace(/\{\{date\}\}/gi, new Date().toLocaleDateString());
                        
                        result = await whatsappService.sendText(recipient, personalizedMessage);
                        break;
                }

                if (result.success) {
                    await Message.create({
                        tenant: tenant._id,
                        waMessageId: result.data.messages[0].id,
                        from: process.env.WHATSAPP_PHONE_NUMBER_ID,
                        to: recipient,
                        direction: 'outbound',
                        type: type,
                        content: type === 'template' 
                            ? { templateName } 
                            : type === 'media'
                            ? { mediaUrl, caption }
                            : { text: message },
                        status: 'sent',
                        sentAt: new Date(),
                        metadata: { broadcast: true }
                    });
                    
                    results.success.push(recipient);
                    successCount++;
                } else {
                    results.failed.push({ recipient, error: result.error });
                    failCount++;
                }
            } catch (err) {
                console.error(`Broadcast error for ${recipient}:`, err.message);
                results.failed.push({ recipient, error: { message: err.message } });
                failCount++;
            }

            if (i < recipients.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        if (successCount > 0) {
            tenant.messageCredits -= successCount;
            tenant.totalMessagesSent += successCount;
            await tenant.save();
        }

        console.log(`✅ Broadcast complete: ${successCount} sent, ${failCount} failed`);

        res.json({
            success: true,
            data: {
                total: recipients.length,
                successful: successCount,
                failed: failCount,
                results
            }
        });
    } catch (error) {
        console.error('❌ Broadcast Error:', error);
        res.status(500).json({ error: 'Broadcast failed', details: error.message });
    }
};