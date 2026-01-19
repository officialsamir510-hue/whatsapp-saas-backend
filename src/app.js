const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// ==================== CORS CONFIGURATION ====================
app.use(cors({
    origin: [
        process.env.FRONTEND_URL,
        'http://localhost:3000',
        'http://localhost:5173',
        'https://whatsapp-saas-frontend.vercel.app',  // Tumhara actual frontend URL
        /\.vercel\.app$/  // Allow ALL vercel.app domains
    ].filter(Boolean),  // Remove undefined values
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors());

// Other Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// ==================== ROOT ROUTES ====================
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'WhatsApp SaaS API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// ==================== MONGODB CONNECTION (SERVERLESS) ====================
let isConnected = false;

const connectDB = async () => {
    if (isConnected && mongoose.connection.readyState === 1) {
        return;
    }

    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI not defined');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        isConnected = true;
        console.log('✅ MongoDB Connected');
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        throw error;
    }
};

// Connect DB middleware
app.use(async (req, res, next) => {
    // Skip DB connection for health routes
    if (req.path === '/' || req.path === '/health' || req.path === '/api/health') {
        return next();
    }
    
    try {
        await connectDB();
        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Database connection failed'
        });
    }
});

// ==================== IMPORT ROUTES ====================
const authRoutes = require('./routes/authRoutes');
const billingRoutes = require('./routes/billingRoutes');
const contactRoutes = require('./routes/contactRoutes');
const messageRoutes = require('./routes/messageRoutes');
const templateRoutes = require('./routes/templateRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const webhookRoutes = require('./routes/webhookRoutes');

// Optional: Meta OAuth routes
let metaOAuthRoutes = null;
try {
    metaOAuthRoutes = require('./routes/metaOAuthRoutes');
} catch (e) {
    console.log('⚠️ metaOAuthRoutes not found, skipping...');
}

// ==================== REGISTER ROUTES ====================
app.use('/api/auth', authRoutes);
if (metaOAuthRoutes) {
    app.use('/api/auth/meta', metaOAuthRoutes);
}
app.use('/api/billing', billingRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhook', webhookRoutes);

// ==================== LOG LOADED ROUTES ====================
console.log('\n📚 Routes Loaded:');
console.log('   - GET    /');
console.log('   - GET    /health');
console.log('   - GET    /api/health');
console.log('   - POST   /api/auth/login');
console.log('   - POST   /api/auth/register');
console.log('   - GET    /api/billing/subscription');

console.log('\n💡 Razorpay: ' + (process.env.RAZORPAY_KEY_ID ? '✅ Configured' : '⚠️ Not configured'));
console.log('💡 Frontend URL: ' + (process.env.FRONTEND_URL || 'Not set'));

// ==================== 404 HANDLER ====================
app.use((req, res) => {
    console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.originalUrl}`
    });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

// ==================== EXPORT APP ====================
module.exports = app;