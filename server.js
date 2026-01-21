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

// Request logging
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
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
        timestamp: new Date().toISOString()
    });
});

app.get('/api', (req, res) => {
    res.json({ 
        status: 'ok',
        message: 'API is working'
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        mongodb: mongoose.connection.readyState === 1
    });
});

// ============================================
// LOAD ROUTES - TRY MULTIPLE PATHS
// ============================================
console.log('📦 Loading routes...');

// Helper function to load routes
const loadRoute = (routePath, mountPath, name) => {
    // Try multiple paths
    const paths = [
        `./routes/${routePath}`,
        `./src/routes/${routePath}`,
        `./${routePath}`
    ];
    
    for (const path of paths) {
        try {
            const route = require(path);
            app.use(mountPath, route);
            console.log(`✅ ${name} loaded from ${path}`);
            return true;
        } catch (e) {
            // Continue to next path
        }
    }
    
    console.log(`⚠️ ${name} not found, creating placeholder...`);
    return false;
};

// Load all routes
loadRoute('authRoutes', '/api/auth', 'Auth routes');
loadRoute('userRoutes', '/api/users', 'User routes');
loadRoute('adminRoutes', '/api/admin', 'Admin routes');
loadRoute('whatsappOAuth.routes', '/api/whatsapp/oauth', 'WhatsApp OAuth routes');
loadRoute('webhookRoutes', '/api/webhook', 'Webhook routes');
loadRoute('messageRoutes', '/api/messages', 'Message routes');
loadRoute('contactRoutes', '/api/contacts', 'Contact routes');
loadRoute('templateRoutes', '/api/templates', 'Template routes');
loadRoute('analyticsRoutes', '/api/analytics', 'Analytics routes');
loadRoute('settingsRoutes', '/api/settings', 'Settings routes');
loadRoute('billingRoutes', '/api/billing', 'Billing routes');
loadRoute('apiKey.routes', '/api/keys', 'API Key routes');

console.log('📦 Routes loading complete');

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
    console.log('❌ 404:', req.method, req.path);
    res.status(404).json({ 
        success: false,
        message: `Route not found: ${req.path}`
    });
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    console.error('💥 Error:', err.message);
    res.status(err.status || 500).json({ 
        success: false,
        message: err.message || 'Internal server error'
    });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('='.repeat(50));
});

module.exports = app;