const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// CORS
app.use(cors({
    origin: function(origin, callback) {
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key']
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// MongoDB Connection
const connectDB = async () => {
    try {
        if (mongoose.connection.readyState === 0) {
            console.log('Connecting to MongoDB...');
            console.log('URI exists:', !!process.env.MONGODB_URI);
            await mongoose.connect(process.env.MONGODB_URI);
            console.log('MongoDB Connected Successfully');
        }
    } catch (error) {
        console.error('MongoDB Connection Error:', error.message);
    }
};

connectDB();

// Health Routes
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'WhatsApp SaaS Backend',
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        env: {
            mongoUri: process.env.MONGODB_URI ? 'SET' : 'NOT SET',
            jwtSecret: process.env.JWT_SECRET ? 'SET' : 'NOT SET'
        }
    });
});

app.get('/api', (req, res) => {
    res.json({ status: 'ok', message: 'API working' });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ============================================
// LOAD ROUTES FROM src/routes
// ============================================
console.log('========== LOADING ROUTES ==========');

// Auth Routes
try {
    const authRoutes = require('./src/routes/authRoutes');
    app.use('/api/auth', authRoutes);
    console.log('AUTH ROUTES: LOADED');
} catch (error) {
    console.error('AUTH ROUTES ERROR:', error.message);
}

// User Routes
try {
    const userRoutes = require('./src/routes/userRoutes');
    app.use('/api/users', userRoutes);
    console.log('USER ROUTES: LOADED');
} catch (error) {
    console.error('USER ROUTES ERROR:', error.message);
}

// Admin Routes
try {
    const adminRoutes = require('./src/routes/adminRoutes');
    app.use('/api/admin', adminRoutes);
    console.log('ADMIN ROUTES: LOADED');
} catch (error) {
    console.error('ADMIN ROUTES ERROR:', error.message);
}

// Message Routes
try {
    const messageRoutes = require('./src/routes/messageRoutes');
    app.use('/api/messages', messageRoutes);
    console.log('MESSAGE ROUTES: LOADED');
} catch (error) {
    console.error('MESSAGE ROUTES ERROR:', error.message);
}

// Contact Routes
try {
    const contactRoutes = require('./src/routes/contactRoutes');
    app.use('/api/contacts', contactRoutes);
    console.log('CONTACT ROUTES: LOADED');
} catch (error) {
    console.error('CONTACT ROUTES ERROR:', error.message);
}

// Template Routes
try {
    const templateRoutes = require('./src/routes/templateRoutes');
    app.use('/api/templates', templateRoutes);
    console.log('TEMPLATE ROUTES: LOADED');
} catch (error) {
    console.error('TEMPLATE ROUTES ERROR:', error.message);
}

// Analytics Routes
try {
    const analyticsRoutes = require('./src/routes/analyticsRoutes');
    app.use('/api/analytics', analyticsRoutes);
    console.log('ANALYTICS ROUTES: LOADED');
} catch (error) {
    console.error('ANALYTICS ROUTES ERROR:', error.message);
}

// Settings Routes
try {
    const settingsRoutes = require('./src/routes/settingsRoutes');
    app.use('/api/settings', settingsRoutes);
    console.log('SETTINGS ROUTES: LOADED');
} catch (error) {
    console.error('SETTINGS ROUTES ERROR:', error.message);
}

// Billing Routes
try {
    const billingRoutes = require('./src/routes/billingRoutes');
    app.use('/api/billing', billingRoutes);
    console.log('BILLING ROUTES: LOADED');
} catch (error) {
    console.error('BILLING ROUTES ERROR:', error.message);
}

// Webhook Routes
try {
    const webhookRoutes = require('./src/routes/webhookRoutes');
    app.use('/api/webhook', webhookRoutes);
    console.log('WEBHOOK ROUTES: LOADED');
} catch (error) {
    console.error('WEBHOOK ROUTES ERROR:', error.message);
}

// WhatsApp OAuth Routes
try {
    const whatsappOAuthRoutes = require('./src/routes/whatsappOAuth.routes');
    app.use('/api/whatsapp/oauth', whatsappOAuthRoutes);
    console.log('WHATSAPP OAUTH ROUTES: LOADED');
} catch (error) {
    console.error('WHATSAPP OAUTH ROUTES ERROR:', error.message);
}

// API Key Routes
try {
    const apiKeyRoutes = require('./src/routes/apiKey.routes');
    app.use('/api/keys', apiKeyRoutes);
    console.log('API KEY ROUTES: LOADED');
} catch (error) {
    console.error('API KEY ROUTES ERROR:', error.message);
}

console.log('========== ROUTES LOADED ==========');

// 404 Handler
app.use((req, res) => {
    console.log('404 NOT FOUND:', req.method, req.path);
    res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.path,
        method: req.method
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err.message);
    res.status(500).json({
        success: false,
        error: err.message
    });
});

// Start Server (Local Development Only)
const PORT = process.env.PORT || 5001;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

// Export for Vercel
module.exports = app;
// Build trigger: 2026-01-21 18:28:36
