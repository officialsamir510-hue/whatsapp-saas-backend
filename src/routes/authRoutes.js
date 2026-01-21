const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

console.log('🔄 Loading authRoutes.js...');

// ============================================
// IMPORT MODELS
// ============================================
let User, Tenant;
try {
    User = require('../models/User');
    Tenant = require('../models/Tenant');
    console.log('✅ Models imported');
} catch (error) {
    console.error('❌ Models import error:', error.message);
}

// ============================================
// IMPORT MIDDLEWARE
// ============================================
let protect;
try {
    const auth = require('../middleware/auth');
    protect = auth.protect || auth.authenticateToken || auth;
    console.log('✅ Auth middleware imported');
} catch (error) {
    console.log('⚠️ Using inline auth middleware');
    protect = async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
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
// TRY TO IMPORT CONTROLLER (Optional)
// ============================================
let authController = null;
try {
    authController = require('../controllers/authController');
    console.log('✅ authController imported');
} catch (error) {
    console.log('⚠️ authController not found, using inline handlers');
}

// ============================================
// HELPER FUNCTIONS
// ============================================
const generateToken = (user, tenant) => {
    return jwt.sign(
        {
            id: user._id.toString(),
            tenantId: tenant?._id?.toString() || 'super_admin',
            email: user.email,
            role: user.role,
            isSuperAdmin: user.isSuperAdmin || false
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '30d' }
    );
};

const formatResponse = (user, tenant) => ({
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
        plan: tenant.plan || 'free',
        messageCredits: tenant.messageCredits || 100,
        apiKey: tenant.apiKey,
        whatsappConfig: tenant.whatsappConfig || { isConnected: false }
    } : null
});

// ============================================
// INLINE HANDLERS (Fallback if no controller)
// ============================================
const inlineRegister = async (req, res) => {
    try {
        const { name, email, password, company } = req.body;
        console.log('📝 Register:', email);

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Name, email and password required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }

        // Create tenant
        const tenant = new Tenant({
            name: company || name,
            company: company || name,
            apiKey: 'wsp_' + crypto.randomBytes(24).toString('hex'),
            plan: 'free',
            messageCredits: 100,
            isActive: true,
            whatsappConfig: { isConnected: false }
        });
        await tenant.save();

        // Hash password & create user
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            tenantId: tenant._id,
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
        await user.save();

        const token = generateToken(user, tenant);
        console.log('✅ Registration successful:', email);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: { token, ...formatResponse(user, tenant) }
        });
    } catch (error) {
        console.error('❌ Register error:', error);
        res.status(500).json({
            success: false,
            message: error.code === 11000 ? 'Email already registered' : error.message
        });
    }
};

const inlineLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('🔐 Login:', email);

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }

        // Find user with password
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(401).json({ success: false, message: 'Account deactivated' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Get tenant
        let tenant;
        if (user.isSuperAdmin || user.role === 'super_admin') {
            tenant = {
                _id: 'super_admin',
                name: 'Super Admin',
                company: 'System',
                plan: 'unlimited',
                messageCredits: 999999,
                whatsappConfig: { isConnected: true }
            };
        } else {
            tenant = await Tenant.findById(user.tenantId);
            if (!tenant) {
                tenant = new Tenant({
                    name: user.name,
                    company: user.name,
                    apiKey: 'wsp_' + crypto.randomBytes(24).toString('hex'),
                    plan: 'free',
                    messageCredits: 100
                });
                await tenant.save();
                user.tenantId = tenant._id;
            }
        }

        user.lastLogin = new Date();
        await user.save();

        const token = generateToken(user, tenant);
        console.log('✅ Login successful:', email);

        res.json({
            success: true,
            message: 'Login successful',
            data: { token, ...formatResponse(user, tenant) }
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const inlineGetMe = async (req, res) => {
    try {
        console.log('📡 GetMe - User:', req.user.id);

        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        let tenant;
        if (user.isSuperAdmin || user.role === 'super_admin') {
            tenant = {
                _id: 'super_admin',
                name: 'Super Admin',
                plan: 'unlimited',
                messageCredits: 999999,
                whatsappConfig: { isConnected: true }
            };
        } else {
            tenant = await Tenant.findById(user.tenantId);
            if (!tenant) {
                tenant = new Tenant({
                    name: user.name,
                    company: user.name,
                    apiKey: 'wsp_' + crypto.randomBytes(24).toString('hex'),
                    plan: 'free',
                    messageCredits: 100
                });
                await tenant.save();
                user.tenantId = tenant._id;
                await user.save();
            }
        }

        res.json({ success: true, data: formatResponse(user, tenant) });
    } catch (error) {
        console.error('❌ GetMe error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const inlineLogout = (req, res) => {
    console.log('🚪 Logout');
    res.json({ success: true, message: 'Logged out successfully' });
};

// ============================================
// ROUTES
// ============================================

// Test route
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Auth routes working!',
        routes: ['POST /register', 'POST /login', 'GET /me', 'POST /logout'],
        usingController: !!authController
    });
});

// Register
router.post('/register', authController?.register || inlineRegister);

// Login
router.post('/login', authController?.login || inlineLogin);

// Get current user (protected)
router.get('/me', protect, authController?.getMe || inlineGetMe);

// Logout
router.post('/logout', authController?.logout || inlineLogout);

console.log('✅ authRoutes.js loaded');
console.log('   Using controller:', !!authController);

module.exports = router;