const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

console.log('✅ Loading authController.js...');

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate JWT Token
const generateToken = (user, tenant) => {
    return jwt.sign(
        {
            id: user._id.toString(),
            tenantId: tenant._id ? tenant._id.toString() : 'super_admin',
            email: user.email,
            role: user.role,
            isSuperAdmin: user.isSuperAdmin || false
        },
        process.env.JWT_SECRET || 'your-super-secret-jwt-key',
        { expiresIn: '30d' }
    );
};

// Format User Response
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
// REGISTER
// ============================================
exports.register = async (req, res) => {
    try {
        const { name, email, password, company, companyName } = req.body;
        
        console.log('📝 Register attempt:', email);

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

        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            console.log('❌ User already exists:', email);
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        // Create tenant first
        console.log('🏢 Creating tenant...');
        const tenant = new Tenant({
            name: company || companyName || name,
            company: company || companyName || name,
            apiKey: 'wsp_' + crypto.randomBytes(24).toString('hex'),
            plan: 'free',
            messageCredits: 100,
            totalMessagesSent: 0,
            isActive: true,
            whatsappConfig: {
                isConnected: false
            }
        });
        await tenant.save();
        console.log('✅ Tenant created:', tenant._id);

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        console.log('👤 Creating user...');
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
        console.log('✅ User created:', user._id);

        // Generate token
        const token = generateToken(user, tenant);

        console.log('✅ Registration successful:', email);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                token,
                ...formatResponse(user, tenant)
            }
        });

    } catch (error) {
        console.error('❌ Registration error:', error);

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
};

// ============================================
// LOGIN
// ============================================
exports.login = async (req, res) => {
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

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('❌ Invalid password for:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Get tenant
        let tenant;

        if (user.isSuperAdmin || user.role === 'super_admin') {
            console.log('🔥 Super admin login');
            tenant = {
                _id: 'super_admin',
                name: 'Super Admin',
                company: 'System Administrator',
                plan: 'unlimited',
                messageCredits: 999999,
                whatsappConfig: { isConnected: true }
            };
        } else {
            tenant = await Tenant.findById(user.tenantId);

            // If tenant not found, create one
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

        console.log('✅ Login successful:', email);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                ...formatResponse(user, tenant)
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed: ' + error.message
        });
    }
};

// ============================================
// GET CURRENT USER
// ============================================
exports.getMe = async (req, res) => {
    try {
        console.log('📡 GetMe called - User ID:', req.user.id);

        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get tenant
        let tenant;

        if (user.isSuperAdmin || user.role === 'super_admin') {
            tenant = {
                _id: 'super_admin',
                name: 'Super Admin',
                company: 'System Administrator',
                plan: 'unlimited',
                messageCredits: 999999,
                whatsappConfig: { isConnected: true }
            };
        } else {
            tenant = await Tenant.findById(user.tenantId);

            // If tenant not found, create one
            if (!tenant) {
                console.log('⚠️ Tenant not found, creating new...');
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

        console.log('✅ User data sent');

        res.json({
            success: true,
            data: formatResponse(user, tenant)
        });

    } catch (error) {
        console.error('❌ GetMe error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user data'
        });
    }
};

// ============================================
// LOGOUT
// ============================================
exports.logout = async (req, res) => {
    console.log('🚪 Logout');
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
};

console.log('✅ authController.js loaded');