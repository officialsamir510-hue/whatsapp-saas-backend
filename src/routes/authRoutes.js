const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ============================================
// IMPORT MODELS
// ============================================
let User, Tenant;
try {
    User = require('../models/User');
    Tenant = require('../models/Tenant');
    console.log('✅ Models imported in authRoutes');
} catch (error) {
    console.error('❌ Models import error:', error.message);
}

// ============================================
// IMPORT MIDDLEWARE
// ============================================
let authenticateToken;
try {
    const auth = require('../middleware/auth');
    authenticateToken = auth.authenticateToken || auth.protect || auth;
    console.log('✅ Auth middleware imported');
} catch (error) {
    console.error('❌ Auth middleware error:', error.message);
    // Fallback middleware
    authenticateToken = async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, message: 'No token provided' });
            }
            
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            req.user = decoded;
            next();
        } catch (error) {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }
    };
}

// ============================================
// HELPER FUNCTIONS
// ============================================
const generateToken = (user, tenant) => {
    return jwt.sign(
        {
            id: user._id.toString(),
            tenantId: tenant._id ? tenant._id.toString() : 'super_admin_tenant',
            email: user.email,
            role: user.role,
            isSuperAdmin: user.isSuperAdmin || false
        },
        process.env.JWT_SECRET || 'your-super-secret-jwt-key',
        { expiresIn: '30d' }
    );
};

const formatUserResponse = (user, tenant) => {
    return {
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isSuperAdmin: user.isSuperAdmin || false,
            permissions: user.permissions || []
        },
        tenant: tenant ? {
            id: tenant._id,
            name: tenant.name,
            company: tenant.company,
            plan: tenant.plan,
            messageCredits: tenant.messageCredits,
            apiKey: tenant.apiKey,
            whatsappConnected: tenant.facebookConnected || false,
            whatsappConfig: tenant.whatsappConfig || { isConnected: false }
        } : null
    };
};

// ============================================
// TEST ROUTE
// ============================================
router.get('/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Auth routes working!',
        routes: ['POST /register', 'POST /login', 'GET /me', 'POST /logout']
    });
});

// ============================================
// REGISTER
// ============================================
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

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        // Check existing user
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

        // Create tenant
        console.log('🏢 Creating tenant...');
        const tenant = new Tenant({
            name: company || name,
            company: company || name,
            apiKey: 'wsp_' + crypto.randomBytes(24).toString('hex'),
            plan: 'free',
            messageCredits: 100,
            totalMessagesSent: 0,
            isActive: true,
            whatsappConfig: {
                isConnected: false
            }
        });

        const savedTenant = await tenant.save();
        console.log('✅ Tenant created:', savedTenant._id);

        // Create user
        console.log('👤 Creating user...');
        const user = new User({
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            tenantId: savedTenant._id,
            role: 'owner',
            isActive: true,
            isSuperAdmin: false,
            plan: 'free',
            planLimits: {
                messagesPerMonth: 1000,
                apiKeysLimit: 2,
                whatsappAccountsLimit: 1,
                templatesLimit: 5,
                contactsLimit: 1000
            }
        });

        const savedUser = await user.save();
        console.log('✅ User created:', savedUser._id);

        // Generate token
        const token = generateToken(savedUser, savedTenant);

        // Format response
        const responseData = formatUserResponse(savedUser, savedTenant);

        console.log('✅ Registration successful:', email);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                token,
                ...responseData
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

// ============================================
// LOGIN
// ============================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('🔐 Login attempt:', email);

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            console.log('❌ User not found:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if active
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            console.log('❌ Invalid password for:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Get tenant
        let tenant = null;

        if (user.isSuperAdmin || user.role === 'super_admin') {
            console.log('🔥 Super admin login');
            tenant = {
                _id: 'super_admin_tenant',
                name: 'Super Admin',
                company: 'System Administrator',
                plan: 'unlimited',
                messageCredits: 999999,
                whatsappConfig: { isConnected: true }
            };
        } else {
            tenant = await Tenant.findById(user.tenantId);

            if (!tenant) {
                console.log('⚠️ Tenant not found, creating new...');
                tenant = new Tenant({
                    name: user.name,
                    company: user.name,
                    apiKey: 'wsp_' + crypto.randomBytes(24).toString('hex'),
                    plan: 'free',
                    messageCredits: 100,
                    whatsappConfig: { isConnected: false }
                });

                await tenant.save();
                user.tenantId = tenant._id;
                await user.save();
            }
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user, tenant);

        // Format response
        const responseData = formatUserResponse(user, tenant);

        console.log('✅ Login successful:', email);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                ...responseData
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
// GET CURRENT USER
// ============================================
router.get('/me', authenticateToken, async (req, res) => {
    try {
        console.log('📡 /auth/me called - User ID:', req.user.id);

        const user = await User.findById(req.user.id).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Super admin
        if (user.isSuperAdmin || user.role === 'super_admin') {
            return res.json({
                success: true,
                data: formatUserResponse(user, {
                    _id: 'super_admin_tenant',
                    name: 'Super Admin',
                    plan: 'unlimited',
                    messageCredits: 999999,
                    whatsappConfig: { isConnected: true }
                })
            });
        }

        // Normal user
        let tenant = await Tenant.findById(user.tenantId);

        if (!tenant) {
            console.log('⚠️ Tenant not found, creating...');
            tenant = new Tenant({
                name: user.name,
                company: user.name,
                apiKey: 'wsp_' + crypto.randomBytes(24).toString('hex'),
                plan: 'free',
                messageCredits: 100,
                whatsappConfig: { isConnected: false }
            });

            await tenant.save();
            user.tenantId = tenant._id;
            await user.save();
        }

        console.log('✅ User data sent');

        res.json({
            success: true,
            data: formatUserResponse(user, tenant)
        });

    } catch (error) {
        console.error('❌ /auth/me error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user data'
        });
    }
});

// ============================================
// LOGOUT
// ============================================
router.post('/logout', (req, res) => {
    console.log('🚪 Logout request');
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

console.log('✅ authRoutes.js loaded');

module.exports = router;