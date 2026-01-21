const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
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
            console.log('❌ CORS blocked origin:', origin);
            callback(null, true); // Allow anyway for development
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

// Request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`📥 [${timestamp}] ${req.method} ${req.path}`);
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
        console.log('✅ MongoDB Connected');
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
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
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            routes: '/api/routes'
        }
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
// LOAD ROUTES
// ============================================
console.log('\n📦 Loading routes...');
console.log('='.repeat(40));

// Helper function to load routes safely
const loadRoute = (routePath, mountPath, name) => {
    const paths = [
        `./routes/${routePath}`,
        `./src/routes/${routePath}`
    ];
    
    for (const path of paths) {
        try {
            const route = require(path);
            app.use(mountPath, route);
            console.log(`✅ ${name.padEnd(25)} → ${mountPath}`);
            return true;
        } catch (e) {
            // Continue to next path
        }
    }
    
    console.log(`⚠️  ${name.padEnd(25)} → Not found`);
    
    // Create placeholder route
    app.use(mountPath, (req, res) => {
        res.status(501).json({
            success: false,
            message: `${name} not implemented yet`,
            path: req.path
        });
    });
    
    return false;
};

// Load all routes
loadRoute('authRoutes', '/api/auth', 'Auth Routes');
loadRoute('userRoutes', '/api/users', 'User Routes');
loadRoute('adminRoutes', '/api/admin', 'Admin Routes');
loadRoute('messageRoutes', '/api/messages', 'Message Routes');
loadRoute('contactRoutes', '/api/contacts', 'Contact Routes');
loadRoute('templateRoutes', '/api/templates', 'Template Routes');
loadRoute('analyticsRoutes', '/api/analytics', 'Analytics Routes');
loadRoute('settingsRoutes', '/api/settings', 'Settings Routes');
loadRoute('billingRoutes', '/api/billing', 'Billing Routes');
loadRoute('webhookRoutes', '/api/webhook', 'Webhook Routes');
loadRoute('whatsappOAuth.routes', '/api/whatsapp/oauth', 'WhatsApp OAuth Routes');
loadRoute('apiKey.routes', '/api/keys', 'API Key Routes');

// Public API v1 Routes (optional)
loadRoute('publicApi/v1/message.routes', '/api/v1/messages', 'Public API v1');

console.log('='.repeat(40));
console.log('📦 Routes loading complete\n');

// ============================================
// DEBUG: LIST ALL ROUTES
// ============================================
app.get('/api/routes', (req, res) => {
    const routes = [];
    
    // Get routes from express router stack
    const getRoutes = (stack, basePath = '') => {
        stack.forEach((layer) => {
            if (layer.route) {
                // Direct route
                const methods = Object.keys(layer.route.methods)
                    .filter(m => layer.route.methods[m])
                    .map(m => m.toUpperCase());
                    
                routes.push({
                    path: basePath + layer.route.path,
                    methods: methods
                });
            } else if (layer.name === 'router' && layer.handle.stack) {
                // Nested router
                let path = '';
                if (layer.regexp) {
                    // Extract path from regexp
                    const match = layer.regexp.toString().match(/^\/\^(\\\/[^?]*)/);
                    if (match) {
                        path = match[1].replace(/\\\//g, '/').replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param');
                    }
                }
                getRoutes(layer.handle.stack, path);
            }
        });
    };
    
    if (app._router && app._router.stack) {
        getRoutes(app._router.stack);
    }
    
    // Sort routes
    routes.sort((a, b) => a.path.localeCompare(b.path));
    
    res.json({
        success: true,
        total: routes.length,
        routes: routes
    });
});

// ============================================
// DEBUG: TEST AUTH ROUTES
// ============================================
app.get('/api/test/auth', (req, res) => {
    res.json({
        success: true,
        message: 'Auth test endpoint',
        availableRoutes: [
            { method: 'GET', path: '/api/auth/test', description: 'Test auth routes' },
            { method: 'POST', path: '/api/auth/register', description: 'Register new user' },
            { method: 'POST', path: '/api/auth/login', description: 'Login user' },
            { method: 'GET', path: '/api/auth/me', description: 'Get current user (requires token)' },
            { method: 'POST', path: '/api/auth/logout', description: 'Logout user' }
        ]
    });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
    console.log(`❌ 404: ${req.method} ${req.path}`);
    res.status(404).json({ 
        success: false,
        message: `Route not found: ${req.method} ${req.path}`,
        hint: 'Check /api/routes for available endpoints'
    });
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    console.error('💥 Error:', err.message);
    console.error('Stack:', err.stack);
    
    res.status(err.status || 500).json({ 
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 WhatsApp SaaS Backend');
    console.log('='.repeat(50));
    console.log(`📡 Server:    http://localhost:${PORT}`);
    console.log(`🔌 API:       http://localhost:${PORT}/api`);
    console.log(`❤️  Health:    http://localhost:${PORT}/api/health`);
    console.log(`📋 Routes:    http://localhost:${PORT}/api/routes`);
    console.log(`🔐 Auth Test: http://localhost:${PORT}/api/auth/test`);
    console.log('='.repeat(50));
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '⏳ Connecting...'}`);
    console.log('='.repeat(50) + '\n');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received. Shutting down gracefully...');
    mongoose.connection.close(false, () => {
        console.log('📦 MongoDB connection closed.');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('👋 SIGINT received. Shutting down gracefully...');
    mongoose.connection.close(false, () => {
        console.log('📦 MongoDB connection closed.');
        process.exit(0);
    });
});

// ============================================
// EXPORT FOR VERCEL
// ============================================
module.exports = app;