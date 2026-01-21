const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// CORS
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://whatsapp-saas-frontend-one.vercel.app',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || (origin && origin.endsWith('.vercel.app'))) {
            callback(null, true);
        } else {
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key']
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// MongoDB
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        isConnected = true;
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB Error:', error.message);
    }
};
connectDB();

// Health Routes
app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'WhatsApp SaaS Backend' });
});

app.get('/api', (req, res) => {
    res.json({ status: 'ok', message: 'API is working' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', mongodb: mongoose.connection.readyState === 1 });
});

// ============================================
// ROUTES - DIRECT IMPORTS FROM src/routes
// ============================================
console.log('Loading routes from src/routes...');

try {
    const authRoutes = require('./src/routes/authRoutes');
    app.use('/api/auth', authRoutes);
    console.log('✓ Auth Routes loaded');
} catch (e) {
    console.error('✗ Auth Routes error:', e.message);
}

try {
    const userRoutes = require('./src/routes/userRoutes');
    app.use('/api/users', userRoutes);
    console.log('✓ User Routes loaded');
} catch (e) {
    console.error('✗ User Routes error:', e.message);
}

try {
    const adminRoutes = require('./src/routes/adminRoutes');
    app.use('/api/admin', adminRoutes);
    console.log('✓ Admin Routes loaded');
} catch (e) {
    console.error('✗ Admin Routes error:', e.message);
}

try {
    const messageRoutes = require('./src/routes/messageRoutes');
    app.use('/api/messages', messageRoutes);
    console.log('✓ Message Routes loaded');
} catch (e) {
    console.error('✗ Message Routes error:', e.message);
}

try {
    const contactRoutes = require('./src/routes/contactRoutes');
    app.use('/api/contacts', contactRoutes);
    console.log('✓ Contact Routes loaded');
} catch (e) {
    console.error('✗ Contact Routes error:', e.message);
}

try {
    const templateRoutes = require('./src/routes/templateRoutes');
    app.use('/api/templates', templateRoutes);
    console.log('✓ Template Routes loaded');
} catch (e) {
    console.error('✗ Template Routes error:', e.message);
}

try {
    const analyticsRoutes = require('./src/routes/analyticsRoutes');
    app.use('/api/analytics', analyticsRoutes);
    console.log('✓ Analytics Routes loaded');
} catch (e) {
    console.error('✗ Analytics Routes error:', e.message);
}

try {
    const settingsRoutes = require('./src/routes/settingsRoutes');
    app.use('/api/settings', settingsRoutes);
    console.log('✓ Settings Routes loaded');
} catch (e) {
    console.error('✗ Settings Routes error:', e.message);
}

try {
    const billingRoutes = require('./src/routes/billingRoutes');
    app.use('/api/billing', billingRoutes);
    console.log('✓ Billing Routes loaded');
} catch (e) {
    console.error('✗ Billing Routes error:', e.message);
}

try {
    const webhookRoutes = require('./src/routes/webhookRoutes');
    app.use('/api/webhook', webhookRoutes);
    console.log('✓ Webhook Routes loaded');
} catch (e) {
    console.error('✗ Webhook Routes error:', e.message);
}

try {
    const whatsappOAuthRoutes = require('./src/routes/whatsappOAuth.routes');
    app.use('/api/whatsapp/oauth', whatsappOAuthRoutes);
    console.log('✓ WhatsApp OAuth Routes loaded');
} catch (e) {
    console.error('✗ WhatsApp OAuth Routes error:', e.message);
}

try {
    const apiKeyRoutes = require('./src/routes/apiKey.routes');
    app.use('/api/keys', apiKeyRoutes);
    console.log('✓ API Key Routes loaded');
} catch (e) {
    console.error('✗ API Key Routes error:', e.message);
}

console.log('Routes loading complete');

// Debug route
app.get('/api/auth/test', (req, res) => {
    res.json({ success: true, message: 'Auth routes working!' });
});

// 404 Handler
app.use((req, res) => {
    console.log('404:', req.method, req.path);
    res.status(404).json({
        success: false,
        message: 'Route not found: ' + req.method + ' ' + req.path
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
});

// Start Server (Local only)
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
        console.log('Server running on http://localhost:' + PORT);
    });
}

module.exports = app;