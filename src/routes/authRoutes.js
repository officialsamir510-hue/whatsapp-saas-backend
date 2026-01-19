const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { authenticateToken } = require('../middleware/auth');

// Facebook OAuth configuration
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || 'https://civic-tesia-exothely.ngrok-free.dev/api/auth/facebook-callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// In-memory state store (use Redis in production)
global.oauthStates = global.oauthStates || {};

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, company } = req.body;

        console.log('📝 Registration attempt:', email);

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email and password are required'
            });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            console.log('❌ User already exists:', email);
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create tenant FIRST
        const tenant = new Tenant({
            name: company || name,
            company: company || name,
            apiKey: crypto.randomBytes(32).toString('hex'),
            plan: 'free',
            messageCredits: 100,
            totalMessagesSent: 0,
            isActive: true
        });
        
        const savedTenant = await tenant.save();
        console.log('✅ Tenant created:', savedTenant._id);

        // Create user with tenant ID
        const user = new User({
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            tenantId: savedTenant._id,
            role: 'owner',
            isActive: true,
            isSuperAdmin: false
        });
        
        const savedUser = await user.save();
        console.log('✅ User created:', savedUser._id);

        // Generate token
        const token = jwt.sign(
            { 
                userId: savedUser._id.toString(), 
                tenantId: savedTenant._id.toString(),
                email: savedUser.email,
                role: savedUser.role,
                isSuperAdmin: false
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        console.log('✅ Registration successful:', email);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                token,
                user: {
                    id: savedUser._id,
                    name: savedUser.name,
                    email: savedUser.email,
                    role: savedUser.role,
                    isSuperAdmin: false,
                    permissions: savedUser.permissions
                },
                tenant: {
                    id: savedTenant._id,
                    name: savedTenant.name,
                    company: savedTenant.company,
                    apiKey: savedTenant.apiKey,
                    plan: savedTenant.plan,
                    messageCredits: savedTenant.messageCredits,
                    totalMessagesSent: savedTenant.totalMessagesSent
                }
            }
        });
    } catch (error) {
        console.error('❌ Registration error:', error);
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        
        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Registration failed: ' + error.message
        });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // ============================================
        // SUPER ADMIN CHECK
        // ============================================
        let tenant = null;
        
        if (user.isSuperAdmin || user.role === 'super_admin') {
            console.log('🔥 SUPER ADMIN LOGIN:', email);
            
            tenant = {
                _id: 'super_admin_tenant',
                name: 'Super Admin',
                company: 'System Administrator',
                plan: 'unlimited',
                messageCredits: 999999,
                totalMessagesSent: 0
            };
        } else {
            console.log('👤 Regular user login:', email);
            
            tenant = await Tenant.findById(user.tenantId);
            
            if (!tenant) {
                console.error('❌ Tenant not found for ID:', user.tenantId);
                
                const newTenant = new Tenant({
                    name: user.name,
                    company: user.name,
                    apiKey: crypto.randomBytes(32).toString('hex'),
                    plan: 'free',
                    messageCredits: 100,
                    totalMessagesSent: 0
                });
                
                tenant = await newTenant.save();
                user.tenantId = tenant._id;
                await user.save();
            }
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { 
                userId: user._id.toString(), 
                tenantId: user.isSuperAdmin ? 'super_admin_tenant' : tenant._id.toString(),
                email: user.email,
                role: user.role,
                isSuperAdmin: user.isSuperAdmin || false
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isSuperAdmin: user.isSuperAdmin || false,
                    permissions: user.permissions
                },
                tenant: user.isSuperAdmin ? {
                    id: 'super_admin_tenant',
                    name: 'Super Admin',
                    company: 'System Administrator',
                    plan: 'unlimited',
                    messageCredits: 999999
                } : {
                    id: tenant._id,
                    name: tenant.name,
                    company: tenant.company,
                    apiKey: tenant.apiKey,
                    plan: tenant.plan,
                    messageCredits: tenant.messageCredits,
                    totalMessagesSent: tenant.totalMessagesSent
                }
            }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed: ' + error.message
        });
    }
});

// ============================================
// GET CURRENT USER - UPDATED FOR SUPER ADMIN
// ============================================
router.get('/me', authenticateToken, async (req, res) => {
    try {
        console.log('🔍 Auth check - User ID:', req.user.userId);
        console.log('🔍 Auth check - Is Super Admin:', req.user.isSuperAdmin);

        const user = await User.findById(req.user.userId).select('-password');
        
        if (!user) {
            console.error('❌ User not found:', req.user.userId);
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // ============================================
        // SUPER ADMIN RESPONSE
        // ============================================
        if (user.isSuperAdmin || user.role === 'super_admin') {
            console.log('🔥 Returning super admin data');
            
            return res.json({
                success: true,
                data: {
                    user: {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        isSuperAdmin: true,  // ← IMPORTANT
                        permissions: user.permissions
                    },
                    tenant: {
                        id: 'super_admin_tenant',
                        name: 'Super Admin',
                        company: 'System Administrator',
                        plan: 'unlimited',
                        messageCredits: 999999,
                        totalMessagesSent: 0
                    }
                }
            });
        }

        // ============================================
        // NORMAL USER RESPONSE
        // ============================================
        console.log('👤 Returning normal user data');
        
        let tenant = await Tenant.findById(user.tenantId);

        if (!tenant) {
            console.error('❌ Tenant not found:', user.tenantId);
            console.log('⚠️ Creating new tenant for user:', user.email);
            
            tenant = new Tenant({
                name: user.name,
                company: user.name,
                apiKey: crypto.randomBytes(32).toString('hex'),
                plan: 'free',
                messageCredits: 100,
                totalMessagesSent: 0
            });
            
            await tenant.save();
            console.log('✅ New tenant created:', tenant._id);
            
            user.tenantId = tenant._id;
            await user.save();
        }

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isSuperAdmin: user.isSuperAdmin || false,  // ← IMPORTANT
                    permissions: user.permissions
                },
                tenant: {
                    id: tenant._id,
                    name: tenant.name,
                    company: tenant.company,
                    apiKey: tenant.apiKey,
                    plan: tenant.plan,
                    messageCredits: tenant.messageCredits,
                    totalMessagesSent: tenant.totalMessagesSent,
                    whatsappConfig: tenant.whatsappConfig,
                    facebookConnected: tenant.facebookConnected || false
                }
            }
        });
    } catch (error) {
        console.error('❌ Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user data: ' + error.message
        });
    }
});

// Regenerate API Key
router.post('/regenerate-api-key', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'owner' && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only owner/admin can regenerate API key'
            });
        }

        const newApiKey = crypto.randomBytes(32).toString('hex');

        const tenant = await Tenant.findByIdAndUpdate(
            req.user.tenantId,
            { 
                apiKey: newApiKey,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        res.json({
            success: true,
            message: 'API Key regenerated successfully',
            data: {
                apiKey: newApiKey
            }
        });
    } catch (error) {
        console.error('Regenerate API key error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to regenerate API key'
        });
    }
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
});

// ============================================
// FACEBOOK OAUTH ROUTES
// ============================================

router.get('/facebook', authenticateToken, (req, res) => {
    try {
        const state = crypto.randomBytes(16).toString('hex');
        
        global.oauthStates[state] = {
            userId: req.user.userId,
            tenantId: req.user.tenantId,
            timestamp: Date.now()
        };

        Object.keys(global.oauthStates).forEach(key => {
            if (Date.now() - global.oauthStates[key].timestamp > 10 * 60 * 1000) {
                delete global.oauthStates[key];
            }
        });

        const scope = [
            'email',
            'whatsapp_business_management',
            'whatsapp_business_messaging',
            'business_management'
        ].join(',');

        const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
            `client_id=${FACEBOOK_APP_ID}` +
            `&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}` +
            `&state=${state}` +
            `&scope=${scope}` +
            `&response_type=code`;

        console.log('📱 Facebook OAuth URL generated for tenant:', req.user.tenantId);

        res.json({
            success: true,
            data: { authUrl }
        });
    } catch (error) {
        console.error('Facebook OAuth initiation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initiate Facebook OAuth'
        });
    }
});

router.get('/facebook-callback', async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        console.log('📱 Facebook callback received');

        if (error) {
            console.error('Facebook OAuth Error:', error, error_description);
            return res.redirect(`${FRONTEND_URL}/settings?error=${error}`);
        }

        const stateData = global.oauthStates[state];
        
        if (!stateData) {
            console.error('Invalid state:', state);
            return res.redirect(`${FRONTEND_URL}/settings?error=invalid_state`);
        }

        if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
            delete global.oauthStates[state];
            return res.redirect(`${FRONTEND_URL}/settings?error=state_expired`);
        }

        const { userId, tenantId } = stateData;
        delete global.oauthStates[state];

        console.log('✅ State verified - User:', userId, 'Tenant:', tenantId);

        const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: {
                client_id: FACEBOOK_APP_ID,
                client_secret: FACEBOOK_APP_SECRET,
                redirect_uri: FACEBOOK_REDIRECT_URI,
                code
            }
        });

        const { access_token } = tokenResponse.data;

        const longLivedTokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: FACEBOOK_APP_ID,
                client_secret: FACEBOOK_APP_SECRET,
                fb_exchange_token: access_token
            }
        });

        const longLivedToken = longLivedTokenResponse.data.access_token;

        const wabaResponse = await axios.get('https://graph.facebook.com/v18.0/me/businesses', {
            params: {
                access_token: longLivedToken,
                fields: 'id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{verified_name,display_phone_number,id}}'
            }
        });

        let whatsappConfig = { accessToken: longLivedToken };
        
        if (wabaResponse.data.data && wabaResponse.data.data.length > 0) {
            const business = wabaResponse.data.data[0];
            
            if (business.owned_whatsapp_business_accounts?.data?.length > 0) {
                const waba = business.owned_whatsapp_business_accounts.data[0];
                const phoneNumber = waba.phone_numbers?.data[0];
                
                whatsappConfig = {
                    businessAccountId: waba.id,
                    phoneNumberId: phoneNumber?.id || null,
                    phoneNumber: phoneNumber?.display_phone_number || null,
                    verifiedName: phoneNumber?.verified_name || null,
                    accessToken: longLivedToken
                };
            }
        }

        await Tenant.findByIdAndUpdate(tenantId, {
            whatsappConfig,
            facebookConnected: true,
            facebookConnectedAt: new Date(),
            updatedAt: new Date()
        });

        console.log('✅ Tenant updated with Facebook connection');

        res.redirect(`${FRONTEND_URL}/settings?connected=true&tab=meta`);

    } catch (error) {
        console.error('❌ Facebook callback error:', error.response?.data || error.message);
        res.redirect(`${FRONTEND_URL}/settings?error=connection_failed`);
    }
});

router.get('/facebook/status', authenticateToken, async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.user.tenantId);
        const connected = !!(tenant?.whatsappConfig?.accessToken);
        
        res.json({
            success: true,
            data: {
                connected,
                whatsappConfig: connected ? {
                    businessAccountId: tenant.whatsappConfig.businessAccountId,
                    phoneNumberId: tenant.whatsappConfig.phoneNumberId,
                    phoneNumber: tenant.whatsappConfig.phoneNumber,
                    verifiedName: tenant.whatsappConfig.verifiedName
                } : null
            }
        });
    } catch (error) {
        console.error('Get Facebook status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get Facebook status'
        });
    }
});

router.post('/facebook/disconnect', authenticateToken, async (req, res) => {
    try {
        await Tenant.findByIdAndUpdate(req.user.tenantId, {
            whatsappConfig: {},
            facebookConnected: false,
            updatedAt: new Date()
        });

        console.log('✅ Facebook disconnected for tenant:', req.user.tenantId);

        res.json({
            success: true,
            message: 'Facebook disconnected successfully'
        });
    } catch (error) {
        console.error('Disconnect Facebook error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to disconnect Facebook'
        });
    }
});

module.exports = router;