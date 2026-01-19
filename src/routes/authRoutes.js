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

// In-memory state store
global.oauthStates = global.oauthStates || {};

// ==================== REGISTER ====================
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, company } = req.body;

        console.log('📝 Registration attempt:', email);

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email and password are required'
            });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create tenant
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

        // Create user
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

        // Generate token (FIXED - use 'id' not 'userId')
        const token = jwt.sign(
            { 
                id: savedUser._id.toString(),  // ✅ Changed from userId to id
                tenantId: savedTenant._id.toString(),
                email: savedUser.email,
                role: savedUser.role,
                isSuperAdmin: false
            },
            process.env.JWT_SECRET,
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
                    plan: savedTenant.plan,
                    messageCredits: savedTenant.messageCredits
                }
            }
        });
    } catch (error) {
        console.error('❌ Registration error:', error);
        
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

// ==================== LOGIN ====================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('🔐 Login attempt:', email);

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
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

        // Check if super admin
        let tenant = null;
        
        if (user.isSuperAdmin || user.role === 'super_admin') {
            console.log('🔥 SUPER ADMIN LOGIN:', email);
            tenant = {
                _id: 'super_admin_tenant',
                name: 'Super Admin',
                company: 'System Administrator',
                plan: 'unlimited',
                messageCredits: 999999
            };
        } else {
            tenant = await Tenant.findById(user.tenantId);
            
            if (!tenant) {
                console.log('⚠️ Creating tenant for user:', email);
                const newTenant = new Tenant({
                    name: user.name,
                    company: user.name,
                    apiKey: crypto.randomBytes(32).toString('hex'),
                    plan: 'free',
                    messageCredits: 100
                });
                
                tenant = await newTenant.save();
                user.tenantId = tenant._id;
                await user.save();
            }
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token (FIXED - use 'id' not 'userId')
        const token = jwt.sign(
            { 
                id: user._id.toString(),  // ✅ Changed from userId to id
                tenantId: user.isSuperAdmin ? 'super_admin_tenant' : tenant._id.toString(),
                email: user.email,
                role: user.role,
                isSuperAdmin: user.isSuperAdmin || false
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log('✅ Login successful:', email);

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
                    plan: 'unlimited',
                    messageCredits: 999999
                } : {
                    id: tenant._id,
                    name: tenant.name,
                    company: tenant.company,
                    plan: tenant.plan,
                    messageCredits: tenant.messageCredits
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

// ==================== GET CURRENT USER ====================
router.get('/me', authenticateToken, async (req, res) => {
    try {
        console.log('📡 /auth/me called for user:', req.user.id);

        const user = await User.findById(req.user.id).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Super admin
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
                        isSuperAdmin: true,
                        permissions: user.permissions
                    },
                    tenant: {
                        id: 'super_admin_tenant',
                        name: 'Super Admin',
                        plan: 'unlimited',
                        messageCredits: 999999
                    }
                }
            });
        }

        // Normal user
        let tenant = await Tenant.findById(user.tenantId);

        if (!tenant) {
            console.log('⚠️ Creating tenant for user:', user.email);
            tenant = new Tenant({
                name: user.name,
                company: user.name,
                apiKey: crypto.randomBytes(32).toString('hex'),
                plan: 'free',
                messageCredits: 100
            });
            
            await tenant.save();
            user.tenantId = tenant._id;
            await user.save();
        }

        console.log('✅ User found:', user.email);

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    isSuperAdmin: false,
                    permissions: user.permissions,
                    tenantId: user.tenantId
                },
                tenant: {
                    id: tenant._id,
                    name: tenant.name,
                    company: tenant.company,
                    plan: tenant.plan,
                    messageCredits: tenant.messageCredits,
                    whatsappConnected: tenant.facebookConnected || false,
                    whatsappConfig: tenant.whatsappConfig
                }
            }
        });
    } catch (error) {
        console.error('❌ /auth/me error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// ==================== LOGOUT ====================
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

// ==================== FACEBOOK OAUTH ====================
router.get('/facebook', authenticateToken, (req, res) => {
    try {
        const state = crypto.randomBytes(16).toString('hex');
        
        global.oauthStates[state] = {
            userId: req.user.id,
            tenantId: req.user.tenantId,
            timestamp: Date.now()
        };

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

        res.json({
            success: true,
            data: { authUrl }
        });
    } catch (error) {
        console.error('Facebook OAuth error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initiate Facebook OAuth'
        });
    }
});

router.get('/facebook-callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;

        if (error) {
            return res.redirect(`${FRONTEND_URL}/settings?error=${error}`);
        }

        const stateData = global.oauthStates[state];
        if (!stateData) {
            return res.redirect(`${FRONTEND_URL}/settings?error=invalid_state`);
        }

        const { userId, tenantId } = stateData;
        delete global.oauthStates[state];

        const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: {
                client_id: FACEBOOK_APP_ID,
                client_secret: FACEBOOK_APP_SECRET,
                redirect_uri: FACEBOOK_REDIRECT_URI,
                code
            }
        });

        const { access_token } = tokenResponse.data;

        await Tenant.findByIdAndUpdate(tenantId, {
            'whatsappConfig.accessToken': access_token,
            facebookConnected: true,
            facebookConnectedAt: new Date()
        });

        res.redirect(`${FRONTEND_URL}/settings?connected=true`);

    } catch (error) {
        console.error('Facebook callback error:', error);
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
                whatsappConfig: connected ? tenant.whatsappConfig : null
            }
        });
    } catch (error) {
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
            facebookConnected: false
        });

        res.json({
            success: true,
            message: 'Facebook disconnected successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to disconnect Facebook'
        });
    }
});

module.exports = router;