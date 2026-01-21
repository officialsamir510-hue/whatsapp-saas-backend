const axios = require('axios');
const crypto = require('crypto');
const WhatsAppAccount = require('../models/WhatsAppAccount');
const Tenant = require('../models/Tenant');
const User = require('../models/User');

const META_API_VERSION = 'v21.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

const oauthStates = new Map();

// Cleanup old states
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
                message: 'Meta OAuth not configured'
            });
        }
        
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
        
        console.log('📞 OAuth Callback');
        
        if (!code || !state) {
            throw new Error('Missing code or state');
        }
        
        const stateData = oauthStates.get(state);
        if (!stateData) {
            throw new Error('Invalid state');
        }
        
        oauthStates.delete(state);
        
        const { userId, tenantId } = stateData;
        
        // Exchange code for token
        console.log('🔄 Exchanging code for token...');
        
        const tokenResponse = await axios.get(`${META_API_BASE}/oauth/access_token`, {
            params: {
                client_id: process.env.META_APP_ID,
                client_secret: process.env.META_APP_SECRET,
                code,
                redirect_uri: process.env.META_REDIRECT_URI
            }
        });
        
        const { access_token } = tokenResponse.data;
        console.log('✅ Token received');
        
        // Get WABA
        const wabaResponse = await axios.get(`${META_API_BASE}/me/businesses`, {
            headers: { Authorization: `Bearer ${access_token}` },
            params: {
                fields: 'id,name,owned_whatsapp_business_accounts{id,name,timezone_id,currency}'
            }
        });
        
        const businesses = wabaResponse.data.data;
        if (!businesses || businesses.length === 0) {
            throw new Error('No WhatsApp Business Account found');
        }
        
        const business = businesses[0];
        const waba = business.owned_whatsapp_business_accounts?.data[0];
        
        if (!waba) {
            throw new Error('No WABA linked');
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
        
        console.log(`✅ Found ${phoneNumbers.length} phone(s)`);
        
        // Save to database
        await WhatsAppAccount.findOneAndUpdate(
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
                tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
            },
            { upsert: true }
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
        
        console.log('✅ Account connected');
        
        // Subscribe to webhooks
        try {
            await axios.post(
                `${META_API_BASE}/${waba.id}/subscribed_apps`,
                {},
                { headers: { Authorization: `Bearer ${access_token}` } }
            );
            console.log('✅ Webhooks subscribed');
        } catch (err) {
            console.error('⚠️ Webhook failed:', err.response?.data);
        }
        
        // Redirect
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/dashboard?connected=success`);
        
    } catch (error) {
        console.error('❌ Callback Error:', error.response?.data || error.message);
        
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/dashboard?connected=error&message=${encodeURIComponent(error.message)}`);
    }
};

// ==================== GET ACCOUNTS ====================
exports.getAccounts = async (req, res) => {
    try {
        const accounts = await WhatsAppAccount.find({
            userId: req.user.id,
            status: { $in: ['active', 'suspended'] }
        }).select('-accessToken');
        
        res.json({
            success: true,
            data: { accounts }
        });
        
    } catch (error) {
        console.error('❌ Get Accounts Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ==================== DISCONNECT ACCOUNT ====================
exports.disconnectAccount = async (req, res) => {
    try {
        const { wabaId } = req.params;
        
        await WhatsAppAccount.findOneAndUpdate(
            { wabaId, userId: req.user.id },
            { status: 'disconnected' }
        );
        
        await Tenant.findByIdAndUpdate(req.user.tenantId, {
            facebookConnected: false,
            whatsappConfig: {
                accessToken: null,
                phoneNumberId: null,
                businessAccountId: null,
                wabaid: null
            }
        });
        
        console.log('✅ Account disconnected:', wabaId);
        
        res.json({
            success: true,
            message: 'Account disconnected'
        });
        
    } catch (error) {
        console.error('❌ Disconnect Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
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
                message: 'Account not found'
            });
        }
        
        const phoneResponse = await axios.get(
            `${META_API_BASE}/${wabaId}/phone_numbers`,
            { headers: { Authorization: `Bearer ${account.accessToken}` } }
        );
        
        const phoneNumbers = phoneResponse.data.data.map(phone => ({
            phoneNumberId: phone.id,
            displayPhoneNumber: phone.display_phone_number,
            verifiedName: phone.verified_name,
            qualityRating: phone.quality_rating || 'UNKNOWN',
            isDefault: account.phoneNumbers.find(p => p.phoneNumberId === phone.id)?.isDefault || false,
            status: 'active'
        }));
        
        account.phoneNumbers = phoneNumbers;
        account.lastSyncedAt = new Date();
        await account.save();
        
        console.log('✅ Account synced');
        
        res.json({
            success: true,
            message: 'Account synced'
        });
        
    } catch (error) {
        console.error('❌ Sync Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
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
                message: 'Account not found'
            });
        }
        
        account.phoneNumbers.forEach(phone => {
            phone.isDefault = phone.phoneNumberId === phoneNumberId;
        });
        
        await account.save();
        
        console.log('✅ Default phone updated');
        
        res.json({
            success: true,
            message: 'Default phone updated'
        });
        
    } catch (error) {
        console.error('❌ Set Default Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ NO module.exports AT THE END!
// ✅ Already using exports.functionName above