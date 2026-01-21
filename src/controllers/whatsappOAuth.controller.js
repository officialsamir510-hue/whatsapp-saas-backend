const axios = require('axios');
const crypto = require('crypto');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const Tenant = require('../models/Tenant');
const User = require('../models/User');

const META_API_VERSION = 'v21.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Temporary state storage (use Redis in production for multi-instance)
const oauthStates = new Map();

// Cleanup old states every 10 minutes
setInterval(() => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [state, data] of oauthStates.entries()) {
        if (data.createdAt < tenMinutesAgo) {
            oauthStates.delete(state);
        }
    }
}, 10 * 60 * 1000);

// ==================== INITIALIZE OAUTH ====================
exports.initOAuth = async (req, res) => {
    try {
        const userId = req.user.id;
        const tenantId = req.user.tenantId;
        
        console.log('🔐 OAuth Init - User:', userId);
        
        // Check user's plan limits
        const user = await User.findById(userId);
        const existingCount = await WhatsAppAccount.countDocuments({
            userId,
            status: 'active'
        });
        
        if (existingCount >= (user?.planLimits?.whatsappAccountsLimit || 1)) {
            return res.status(403).json({
                success: false,
                message: `You can only connect ${user?.planLimits?.whatsappAccountsLimit || 1} WhatsApp account(s) on your current plan`,
                upgrade: true
            });
        }
        
        // Generate CSRF state token
        const state = crypto.randomBytes(32).toString('hex');
        oauthStates.set(state, {
            userId,
            tenantId,
            createdAt: Date.now()
        });
        
        const META_APP_ID = process.env.META_APP_ID;
        const REDIRECT_URI = process.env.META_REDIRECT_URI;
        
        if (!META_APP_ID || !REDIRECT_URI) {
            return res.status(500).json({
                success: false,
                message: 'Meta OAuth not configured. Please contact support.'
            });
        }
        
        // Build OAuth URL
        const oauthUrl = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?` +
            `client_id=${META_APP_ID}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
            `&state=${state}` +
            `&scope=whatsapp_business_management,whatsapp_business_messaging` +
            `&response_type=code`;
        
        console.log('✅ OAuth URL generated');
        
        res.json({
            success: true,
            data: { oauthUrl }
        });
        
    } catch (error) {
        console.error('❌ OAuth Init Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ==================== OAUTH CALLBACK ====================
exports.handleCallback = async (req, res) => {
    try {
        const { code, state } = req.query;
        
        console.log('📞 OAuth Callback received');
        
        if (!code || !state) {
            throw new Error('Missing authorization code or state');
        }
        
        // Verify state token
        const stateData = oauthStates.get(state);
        if (!stateData) {
            throw new Error('Invalid or expired state token. Please try again.');
        }
        
        oauthStates.delete(state);
        const { userId, tenantId } = stateData;
        
        // Exchange code for access token
        console.log('🔄 Exchanging authorization code for access token...');
        
        const tokenResponse = await axios.get(`${META_API_BASE}/oauth/access_token`, {
            params: {
                client_id: process.env.META_APP_ID,
                client_secret: process.env.META_APP_SECRET,
                code,
                redirect_uri: process.env.META_REDIRECT_URI
            }
        });
        
        const { access_token } = tokenResponse.data;
        console.log('✅ Access token received');
        
        // Get user's WhatsApp Business Accounts
        const wabaResponse = await axios.get(`${META_API_BASE}/me/businesses`, {
            headers: { Authorization: `Bearer ${access_token}` },
            params: {
                fields: 'id,name,owned_whatsapp_business_accounts{id,name,timezone_id,currency}'
            }
        });
        
        const businesses = wabaResponse.data.data;
        if (!businesses || businesses.length === 0) {
            throw new Error('No WhatsApp Business Account found. Please create one in Meta Business Manager.');
        }
        
        const business = businesses[0];
        const waba = business.owned_whatsapp_business_accounts?.data[0];
        
        if (!waba) {
            throw new Error('No WhatsApp Business Account linked to this business.');
        }
        
        console.log('✅ WABA found:', waba.name);
        
        // Get phone numbers
        const phoneResponse = await axios.get(
            `${META_API_BASE}/${waba.id}/phone_numbers`,
            { headers: { Authorization: `Bearer ${access_token}` } }
        );
        
        const phoneNumbers = phoneResponse.data.data.map((phone, index) => ({
            phoneNumberId: phone.id,
            displayPhoneNumber: phone.display_phone_number,
            verifiedName: phone.verified_name,
            qualityRating: phone.quality_rating || 'UNKNOWN',
            isDefault: index === 0,
            status: 'active'
        }));
        
        console.log(`✅ Found ${phoneNumbers.length} phone number(s)`);
        
        // Save/Update WhatsApp Account in database
        const whatsappAccount = await WhatsAppAccount.findOneAndUpdate(
            { wabaId: waba.id },
            {
                userId,
                tenantId,
                wabaId: waba.id,
                businessId: business.id,
                accessToken: access_token,
                phoneNumbers,
                accountName: waba.name,
                timezone: waba.timezone_id,
                currency: waba.currency,
                status: 'active',
                lastSyncedAt: new Date(),
                tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60 days
            },
            { upsert: true, new: true }
        );
        
        // Update tenant
        await Tenant.findByIdAndUpdate(tenantId, {
            facebookConnected: true,
            facebookConnectedAt: new Date(),
            whatsappConfig: {
                accessToken: access_token,
                phoneNumberId: phoneNumbers[0]?.phoneNumberId,
                businessAccountId: business.id,
                wabaid: waba.id
            }
        });
        
        console.log('✅ WhatsApp account connected successfully');
        
        // Subscribe to webhooks
        try {
            await axios.post(
                `${META_API_BASE}/${waba.id}/subscribed_apps`,
                {},
                { headers: { Authorization: `Bearer ${access_token}` } }
            );
            console.log('✅ Webhook subscribed');
        } catch (webhookError) {
            console.error('⚠️ Webhook subscription failed:', webhookError.response?.data);
            // Don't fail the flow, webhook can be configured later
        }
        
        // Redirect to frontend
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/whatsapp-connect?connected=success`);
        
    } catch (error) {
        console.error('❌ OAuth Callback Error:', error.response?.data || error.message);
        
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const errorMessage = encodeURIComponent(error.message || 'OAuth failed');
        res.redirect(`${frontendUrl}/whatsapp-connect?connected=error&message=${errorMessage}`);
    }
};

// ==================== GET CONNECTED ACCOUNTS ====================
exports.getAccounts = async (req, res) => {
    try {
        const accounts = await WhatsAppAccount.find({
            userId: req.user.id,
            status: { $in: ['active', 'limited'] }
        }).select('-accessToken'); // Don't expose access token
        
        res.json({
            success: true,
            data: { accounts }
        });
        
    } catch (error) {
        console.error('❌ Get Accounts Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch WhatsApp accounts',
            error: error.message
        });
    }
};

// ==================== DISCONNECT ACCOUNT ====================
exports.disconnectAccount = async (req, res) => {
    try {
        const { wabaId } = req.params;
        
        const account = await WhatsAppAccount.findOneAndUpdate(
            { wabaId, userId: req.user.id },
            { status: 'disconnected' },
            { new: true }
        );
        
        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'WhatsApp account not found'
            });
        }
        
        // Update tenant if this was the main account
        const tenant = await Tenant.findById(req.user.tenantId);
        if (tenant?.whatsappConfig?.wabaid === wabaId) {
            await Tenant.findByIdAndUpdate(req.user.tenantId, {
                facebookConnected: false,
                whatsappConfig: {
                    accessToken: null,
                    phoneNumberId: null,
                    businessAccountId: null,
                    wabaid: null
                }
            });
        }
        
        console.log('✅ Account disconnected:', wabaId);
        
        res.json({
            success: true,
            message: 'WhatsApp account disconnected successfully'
        });
        
    } catch (error) {
        console.error('❌ Disconnect Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to disconnect account',
            error: error.message
        });
    }
};

// ==================== SYNC ACCOUNT ====================
exports.syncAccount = async (req, res) => {
    try {
        const { wabaId } = req.params;
        
        const account = await WhatsAppAccount.findOne({
            wabaId,
            userId: req.user.id
        }).select('+accessToken');
        
        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'WhatsApp account not found'
            });
        }
        
        // Fetch latest phone numbers from Meta
        const phoneResponse = await axios.get(
            `${META_API_BASE}/${wabaId}/phone_numbers`,
            { headers: { Authorization: `Bearer ${account.accessToken}` } }
        );
        
        const phoneNumbers = phoneResponse.data.data.map(phone => {
            const existing = account.phoneNumbers.find(p => p.phoneNumberId === phone.id);
            return {
                phoneNumberId: phone.id,
                displayPhoneNumber: phone.display_phone_number,
                verifiedName: phone.verified_name,
                qualityRating: phone.quality_rating || 'UNKNOWN',
                isDefault: existing?.isDefault || false,
                status: 'active'
            };
        });
        
        account.phoneNumbers = phoneNumbers;
        account.lastSyncedAt = new Date();
        await account.save();
        
        console.log('✅ Account synced:', wabaId);
        
        res.json({
            success: true,
            message: 'Account synced successfully'
        });
        
    } catch (error) {
        console.error('❌ Sync Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync account',
            error: error.message
        });
    }
};

// ==================== SET DEFAULT PHONE ====================
exports.setDefaultPhone = async (req, res) => {
    try {
        const { wabaId, phoneNumberId } = req.params;
        
        const account = await WhatsAppAccount.findOne({
            wabaId,
            userId: req.user.id
        });
        
        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'WhatsApp account not found'
            });
        }
        
        // Set all to false, then set selected to true
        account.phoneNumbers.forEach(phone => {
            phone.isDefault = phone.phoneNumberId === phoneNumberId;
        });
        
        await account.save();
        
        console.log('✅ Default phone updated:', phoneNumberId);
        
        res.json({
            success: true,
            message: 'Default phone number updated successfully'
        });
        
    } catch (error) {
        console.error('❌ Set Default Phone Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update default phone',
            error: error.message
        });
    }
};