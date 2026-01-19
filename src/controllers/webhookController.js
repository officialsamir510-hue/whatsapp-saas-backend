const crypto = require('crypto');
const Message = require('../models/Message');
const Contact = require('../models/Contact');
const Tenant = require('../models/Tenant');
const whatsappService = require('../services/whatsappService');

// Verify Webhook (GET request from Meta)
exports.verify = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('Webhook verification request:', { mode, token });

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed');
        res.sendStatus(403);
    }
};

// Handle Webhook Events (POST request from Meta)
exports.handleWebhook = async (req, res) => {
    try {
        // Verify signature (optional but recommended)
        const signature = req.headers['x-hub-signature-256'];
        if (signature && !verifySignature(req.body, signature)) {
            console.log('❌ Invalid webhook signature');
            return res.sendStatus(401);
        }

        const body = req.body;
        console.log('📩 Webhook received:', JSON.stringify(body, null, 2));

        // Immediately respond with 200 to acknowledge receipt
        res.sendStatus(200);

        // Process webhook asynchronously
        if (body.object === 'whatsapp_business_account') {
            for (const entry of body.entry) {
                const changes = entry.changes || [];
                
                for (const change of changes) {
                    if (change.field === 'messages') {
                        await processMessagesChange(change.value, req.app.get('io'));
                    }
                }
            }
        }
    } catch (error) {
        console.error('Webhook Error:', error);
        // Still send 200 to prevent retry
        if (!res.headersSent) {
            res.sendStatus(200);
        }
    }
};

// Process message changes
async function processMessagesChange(value, io) {
    const metadata = value.metadata;
    const phoneNumberId = metadata.phone_number_id;

    // Find tenant by phone number ID (for multi-tenant support)
    // For now, we'll use a default tenant or match by phone number ID
    const tenant = await Tenant.findOne({
        $or: [
            { 'whatsappConfig.phoneNumberId': phoneNumberId },
            {} // Fallback to first tenant for single-tenant setup
        ]
    });

    if (!tenant) {
        console.log('No tenant found for phone number ID:', phoneNumberId);
        return;
    }

    // Process incoming messages
    if (value.messages) {
        for (const message of value.messages) {
            await processIncomingMessage(message, value.contacts, tenant, io);
        }
    }

    // Process status updates
    if (value.statuses) {
        for (const status of value.statuses) {
            await processStatusUpdate(status, tenant, io);
        }
    }
}

// Process incoming message
async function processIncomingMessage(message, contacts, tenant, io) {
    try {
        const contact = contacts?.[0];
        const from = message.from;
        
        console.log('📨 Processing incoming message from:', from);

        // Prepare message content based on type
        let content = {};
        switch (message.type) {
            case 'text':
                content.text = message.text.body;
                break;
            case 'image':
                content.mediaId = message.image.id;
                content.mimeType = message.image.mime_type;
                content.caption = message.image.caption;
                break;
            case 'video':
                content.mediaId = message.video.id;
                content.mimeType = message.video.mime_type;
                content.caption = message.video.caption;
                break;
            case 'audio':
                content.mediaId = message.audio.id;
                content.mimeType = message.audio.mime_type;
                break;
            case 'document':
                content.mediaId = message.document.id;
                content.mimeType = message.document.mime_type;
                content.fileName = message.document.filename;
                content.caption = message.document.caption;
                break;
            case 'location':
                content.location = {
                    latitude: message.location.latitude,
                    longitude: message.location.longitude,
                    name: message.location.name,
                    address: message.location.address
                };
                break;
            case 'sticker':
                content.mediaId = message.sticker.id;
                content.mimeType = message.sticker.mime_type;
                break;
            case 'interactive':
                if (message.interactive.type === 'button_reply') {
                    content.interactive = {
                        type: 'button_reply',
                        buttonId: message.interactive.button_reply.id,
                        buttonTitle: message.interactive.button_reply.title
                    };
                } else if (message.interactive.type === 'list_reply') {
                    content.interactive = {
                        type: 'list_reply',
                        listId: message.interactive.list_reply.id,
                        listTitle: message.interactive.list_reply.title,
                        listDescription: message.interactive.list_reply.description
                    };
                }
                break;
            default:
                content.raw = message[message.type];
        }

        // Save message
        const savedMessage = await Message.create({
            tenant: tenant._id,
            waMessageId: message.id,
            from: from,
            to: process.env.WHATSAPP_PHONE_NUMBER_ID,
            direction: 'inbound',
            type: message.type,
            content: content,
            status: 'delivered',
            context: message.context ? {
                messageId: message.context.id,
                from: message.context.from
            } : undefined,
            metadata: {
                timestamp: message.timestamp
            }
        });

        // Update contact
        await Contact.findOneAndUpdate(
            { tenant: tenant._id, waId: from },
            {
                $set: {
                    phone: from,
                    profileName: contact?.profile?.name,
                    'stats.lastMessageAt': new Date()
                },
                $inc: { 'stats.totalMessages': 1 },
                $setOnInsert: {
                    name: contact?.profile?.name,
                    'stats.firstMessageAt': new Date()
                }
            },
            { upsert: true }
        );

        // Mark as read (optional)
        await whatsappService.markAsRead(message.id);

        // Emit socket event for real-time updates
        if (io) {
            io.to(`tenant-${tenant._id}`).emit('new-message', {
                message: savedMessage,
                contact: {
                    waId: from,
                    name: contact?.profile?.name
                }
            });
        }

        // Auto-reply if enabled
        if (tenant.settings?.autoReply && tenant.settings?.autoReplyMessage) {
            await whatsappService.sendText(from, tenant.settings.autoReplyMessage);
        }

        console.log('✅ Message saved:', savedMessage._id);
    } catch (error) {
        console.error('Process Incoming Message Error:', error);
    }
}

// Process status update
async function processStatusUpdate(status, tenant, io) {
    try {
        const messageId = status.id;
        const statusValue = status.status; // sent, delivered, read, failed
        
        console.log('📊 Status update:', messageId, statusValue);

        const updateData = { status: statusValue };
        
        if (statusValue === 'delivered') {
            updateData.deliveredAt = new Date(parseInt(status.timestamp) * 1000);
        } else if (statusValue === 'read') {
            updateData.readAt = new Date(parseInt(status.timestamp) * 1000);
        } else if (statusValue === 'failed') {
            updateData.error = {
                code: status.errors?.[0]?.code,
                message: status.errors?.[0]?.message
            };
        }

        const updatedMessage = await Message.findOneAndUpdate(
            { waMessageId: messageId },
            { $set: updateData },
            { new: true }
        );

        if (updatedMessage && io) {
            io.to(`tenant-${tenant._id}`).emit('message-status', {
                messageId: updatedMessage._id,
                waMessageId: messageId,
                status: statusValue
            });
        }
    } catch (error) {
        console.error('Process Status Update Error:', error);
    }
}

// Verify webhook signature
function verifySignature(payload, signature) {
    try {
        const expectedSignature = crypto
            .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
            .update(JSON.stringify(payload))
            .digest('hex');
        
        return signature === `sha256=${expectedSignature}`;
    } catch (error) {
        return false;
    }
}