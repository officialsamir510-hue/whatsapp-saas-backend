const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();

// ============================================
// CORS CONFIGURATION
// ============================================
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5174',
    'https://whatsapp-saas-frontend-one.vercel.app',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key']
}));

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log('[' + timestamp + '] ' + req.method + ' ' + req.path);
    next();
});

// ============================================
// MONGODB CONNECTION
// ============================================
let isConnected = false;

const connectDB = async () => {
    if (isConnected && mongoose.connection.readyState === 1) {
        return;
    }
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        isConnected = true;
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB Connection Error:', error.message);
        throw error;
    }
};

connectDB().catch(err => console.error('Initial DB connection failed:', err));

// ============================================
// HEALTH CHECK ROUTES
// ============================================
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'WhatsApp SaaS Backend',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

app.get('/api', (req, res) => {
    res.json({
        status: 'ok',
        message: 'API is working',
        endpoints: { health: '/api/health', auth: '/api/auth', routes: '/api/routes' }
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        mongodb: mongoose.connection.readyState === 1,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ============================================
// LOAD ROUTES - FIXED VERSION
// ============================================
console.log('Loading routes...');

// Direct imports from src/routes (Vercel compatible)
try {
    const authRoutes = require('./src/routes/authRoutes');
    app.use('/api/auth', authRoutes);
    console.log('Auth Routes loaded');
} catch (e) {
    console.error('Auth Routes error:', e.message);
}

try {
    const userRoutes = require('./src/routes/userRoutes');
    app.use('/api/users', userRoutes);
    console.log('User Routes loaded');
} catch (e) {
    console.error('User Routes error:', e.message);
}

try {
    const adminRoutes = require('./src/routes/adminRoutes');
    app.use('/api/admin', adminRoutes);
    console.log('Admin Routes loaded');
} catch (e) {
    console.error('Admin Routes error:', e.message);
}

try {
    const messageRoutes = require('./src/routes/messageRoutes');
    app.use('/api/messages', messageRoutes);
    console.log('Message Routes loaded');
} catch (e) {
    console.error('Message Routes error:', e.message);
}

try {
    const contactRoutes = require('./src/routes/contactRoutes');
    app.use('/api/contacts', contactRoutes);
    console.log('Contact Routes loaded');
} catch (e) {
    console.error('Contact Routes error:', e.message);
}

try {
    const templateRoutes = require('./src/routes/templateRoutes');
    app.use('/api/templates', templateRoutes);
    console.log('Template Routes loaded');
} catch (e) {
    console.error('Template Routes error:', e.message);
}

try {
    const analyticsRoutes = require('./src/routes/analyticsRoutes');
    app.use('/api/analytics', analyticsRoutes);
    console.log('Analytics Routes loaded');
} catch (e) {
    console.error('Analytics Routes error:', e.message);
}

try {
    const settingsRoutes = require('./src/routes/settingsRoutes');
    app.use('/api/settings', settingsRoutes);
    console.log('Settings Routes loaded');
} catch (e) {
    console.error('Settings Routes error:', e.message);
}

try {
    const billingRoutes = require('./src/routes/billingRoutes');
    app.use('/api/billing', billingRoutes);
    console.log('Billing Routes loaded');
} catch (e) {
    console.error('Billing Routes error:', e.message);
}

try {
    const webhookRoutes = require('./src/routes/webhookRoutes');
    app.use('/api/webhook', webhookRoutes);
    console.log('Webhook Routes loaded');
} catch (e) {
    console.error('Webhook Routes error:', e.message);
}

try {
    const whatsappOAuthRoutes = require('./src/routes/whatsappOAuth.routes');
    app.use('/api/whatsapp/oauth', whatsappOAuthRoutes);
    console.log('WhatsApp OAuth Routes loaded');
} catch (e) {
    console.error('WhatsApp OAuth Routes error:', e.message);
}

try {
    const apiKeyRoutes = require('./src/routes/apiKey.routes');
    app.use('/api/keys', apiKeyRoutes);
    console.log('API Key Routes loaded');
} catch (e) {
    console.error('API Key Routes error:', e.message);
}

try {
    const publicApiRoutes = require('./src/routes/publicApi/v1/message.routes');
    app.use('/api/v1/messages', publicApiRoutes);
    console.log('Public API v1 loaded');
} catch (e) {
    console.log('Public API v1 not found (optional)');
}

console.log('Routes loading complete');

// ============================================
// DEBUG ROUTES
// ============================================
app.get('/api/routes', (req, res) => {
    const routes = [];
    const getRoutes = (stack, basePath) => {
        stack.forEach((layer) => {
            if (layer.route) {
                const methods = Object.keys(layer.route.methods).filter(m => layer.route.methods[m]).map(m => m.toUpperCase());
                routes.push({ path: basePath + layer.route.path, methods: methods });
            } else if (layer.name === 'router' && layer.handle.stack) {
                let layerPath = '';
                if (layer.regexp) {
                    const match = layer.regexp.toString().match(/\\\/([^\\?]*)/);
                    if (match) layerPath = '/' + match[1].replace(/\\\//g, '/');
                }
                getRoutes(layer.handle.stack, layerPath);
            }
        });
    };
    if (app._router && app._router.stack) getRoutes(app._router.stack, '');
    routes.sort((a, b) => a.path.localeCompare(b.path));
    res.json({ success: true, total: routes.length, routes: routes });
});

app.get('/api/test/auth', (req, res) => {
    res.json({
        success: true,
        message: 'Auth test endpoint',
        availableRoutes: [
            { method: 'GET', path: '/api/auth/test' },
            { method: 'POST', path: '/api/auth/register' },
            { method: 'POST', path: '/api/auth/login' },
            { method: 'GET', path: '/api/auth/me' },
            { method: 'POST', path: '/api/auth/logout' }
        ]
    });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
    console.log('404: ' + req.method + ' ' + req.path);
    res.status(404).json({
        success: false,
        message: 'Route not found: ' + req.method + ' ' + req.path,
        hint: 'Check /api/routes for available endpoints'
    });
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

// ============================================
// START SERVER (Local only)
// ============================================
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
        console.log('Server running on http://localhost:' + PORT);
        console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    });
}

// ============================================
// EXPORT FOR VERCEL
// ============================================
module.exports = app;

