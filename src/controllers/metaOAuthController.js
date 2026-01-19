// src/controllers/metaOAuthController.js

const axios = require('axios');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { encrypt, decrypt } = require('../utils/encryption');

const META_CONFIG = {
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    graphUrl: 'https://graph.facebook.com/v18.0'
};

// Generate OAuth URL
exports.getOAuthUrl = async (req, res) => {
    try {
        const userId = req.user.id;
        const tenantId = req.user.tenantId;

        const state = Buffer.from(JSON.stringify({
            userId,
            tenantId,
            timestamp: Date.now()
        })).toString('base64');

        const params = new URLSearchParams({
            client_id: process.env.META_APP_ID,
            redirect_uri: process.env.META_REDIRECT_URI,
            scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
            response_type: 'code',
            state: state
        });

        const authUrl = `${META_CONFIG.authUrl}?${params.toString()}`;

        res.json({
            success: true,
            authUrl: authUrl
        });

    } catch (error) {
        console.error('OAuth URL Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate OAuth URL'
        });
    }
};

// Handle OAuth Callback
exports.handleCallback = async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        if (error) {
            console.error('Meta OAuth Error:', error);
            return res.redirect(
                `${process.env.FRONTEND_URL}/settings?error=${error}`
            );
        }

        if (!code || !state) {
            return res.redirect(
                `${process.env.FRONTEND_URL}/settings?error=missing_code`
            );
        }

        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        const { userId, tenantId } = stateData;

        // Exchange code for token
        const tokenResponse = await axios.get(META_CONFIG.tokenUrl, {
            params: {
                client_id: process.env.META_APP_ID,
                client_secret: process.env.META_APP_SECRET,
                redirect_uri: process.env.META_REDIRECT_URI,
                code: code
            }
        });

        const accessToken = tokenResponse.data.access_token;

        // Get WhatsApp Business Account
        const wabaResponse = await axios.get(
            `${META_CONFIG.graphUrl}/me/businesses`,
            {
                params: { 
                    access_token: accessToken,
                    fields: 'id,name,owned_whatsapp_business_accounts'
                }
            }
        );

        let wabaId = null;
        let businessName = null;
        
        for (const business of wabaResponse.data.data) {
            if (business.owned_whatsapp_business_accounts?.data?.length > 0) {
                wabaId = business.owned_whatsapp_business_accounts.data[0].id;
                businessName = business.name;
                break;
            }
        }

        if (!wabaId) {
            return res.redirect(
                `${process.env.FRONTEND_URL}/settings?error=no_whatsapp_account`
            );
        }

        // Get Phone Number
        const phoneResponse = await axios.get(
            `${META_CONFIG.graphUrl}/${wabaId}/phone_numbers`,
            {
                params: { access_token: accessToken }
            }
        );

        if (!phoneResponse.data.data || phoneResponse.data.data.length === 0) {
            return res.redirect(
                `${process.env.FRONTEND_URL}/settings?error=no_phone_number`
            );
        }

        const phoneData = phoneResponse.data.data[0];

        // Update Tenant
        await Tenant.findByIdAndUpdate(tenantId, {
            whatsappConfig: {
                businessAccountId: wabaId,
                phoneNumberId: phoneData.id,
                phoneNumber: phoneData.display_phone_number,
                verifiedName: phoneData.verified_name || businessName,
                accessToken: encrypt(accessToken)
            },
            facebookConnected: true,
            facebookConnectedAt: new Date()
        });

        console.log('✅ WhatsApp connected for tenant:', tenantId);
        
        res.redirect(`${process.env.FRONTEND_URL}/settings?success=connected`);

    } catch (error) {
        console.error('OAuth Callback Error:', error.response?.data || error.message);
        res.redirect(
            `${process.env.FRONTEND_URL}/settings?error=oauth_failed`
        );
    }
};

// Get Connection Status
exports.getConnectionStatus = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        
        const tenant = await Tenant.findById(tenantId);

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        res.json({
            success: true,
            data: {
                isConnected: tenant.facebookConnected || false,
                phoneNumber: tenant.whatsappConfig?.phoneNumber || null,
                verifiedName: tenant.whatsappConfig?.verifiedName || null
            }
        });

    } catch (error) {
        console.error('Connection Status Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get status'
        });
    }
};

// Disconnect WhatsApp
exports.disconnectWhatsApp = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        await Tenant.findByIdAndUpdate(tenantId, {
            whatsappConfig: {
                businessAccountId: null,
                phoneNumberId: null,
                phoneNumber: null,
                verifiedName: null,
                accessToken: null
            },
            facebookConnected: false
        });

        res.json({
            success: true,
            message: 'WhatsApp disconnected'
        });

    } catch (error) {
        console.error('Disconnect Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to disconnect'
        });
    }
};