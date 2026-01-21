const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// ==================== CORS CONFIGURATION ====================
app.use(cors({
    origin: function(origin, callback) {
        const allowedOrigins = [
            process.env.FRONTEND_URL,
            'https://whatsapp-saas-frontend-one.vercel.app',
            'http://localhost:3000',
            'http://localhost:5173'
        ].filter(Boolean);
        
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
            return callback(null, true);
        }
        
        // Allow if origin is in allowedOrigins or ends with .vercel.app
        if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            console.log('❌ CORS blocked origin:', origin);
            callback(null, true); // ⚠️ Allow anyway during testing - remove in production
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400 // 24 hours
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
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            api: '/api',
            publicApi: '/api/v1',
            docs: '/api/docs'
        }
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

        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        
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

// ==================== IMPORT NEW ROUTES ====================
const whatsappOAuthRoutes = require('./routes/whatsappOAuth.routes');
const apiKeyRoutes = require('./routes/apiKey.routes');

// Public API v1 Routes (with error handling)
let publicApiMessageRoutes = null;
try {
    publicApiMessageRoutes = require('./routes/publicApi/v1/message.routes');
} catch (e) {
    console.log('⚠️ publicApi message routes not found, skipping...');
}

// Optional: Meta OAuth routes
let metaOAuthRoutes = null;
try {
    metaOAuthRoutes = require('./routes/metaOAuthRoutes');
} catch (e) {
    console.log('⚠️ metaOAuthRoutes not found, skipping...');
}

// ==================== REGISTER ROUTES (Dashboard/Internal) ====================
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

// ==================== REGISTER NEW ROUTES ====================

// WhatsApp OAuth (Dashboard)
app.use('/api/whatsapp/oauth', whatsappOAuthRoutes);

// API Keys Management (Dashboard)
app.use('/api/keys', apiKeyRoutes);

// Public API v1 (For users to use with API keys)
if (publicApiMessageRoutes) {
    app.use('/api/v1/messages', publicApiMessageRoutes);
}

// ==================== PUBLIC API INFO ROUTE ====================
app.get('/api/v1', (req, res) => {
    res.json({
        success: true,
        message: 'WhatsApp SaaS Public API v1',
        version: '1.0.0',
        endpoints: {
            sendMessage: {
                method: 'POST',
                path: '/api/v1/messages/send',
                description: 'Send a WhatsApp message',
                headers: {
                    'X-API-Key': 'Your API key (required)',
                    'Content-Type': 'application/json'
                }
            },
            messageStatus: {
                method: 'GET',
                path: '/api/v1/messages/:messageId/status',
                description: 'Get message delivery status'
            },
            messageHistory: {
                method: 'GET',
                path: '/api/v1/messages/history',
                description: 'Get message history'
            },
            sendTemplate: {
                method: 'POST',
                path: '/api/v1/messages/template',
                description: 'Send a template message'
            },
            sendBulk: {
                method: 'POST',
                path: '/api/v1/messages/bulk',
                description: 'Send bulk messages'
            }
        },
        documentation: 'https://your-domain.com/api/docs'
    });
});

// ==================== LOG LOADED ROUTES ====================
console.log('\n' + '='.repeat(50));
console.log('📚 Dashboard Routes (JWT Auth):');
console.log('='.repeat(50));
console.log('   - GET    /');
console.log('   - GET    /health');
console.log('   - GET    /api/health');
console.log('   - POST   /api/auth/login');
console.log('   - POST   /api/auth/register');
console.log('   - GET    /api/auth/me');
console.log('   - GET    /api/billing/subscription');
console.log('   - GET    /api/contacts');
console.log('   - GET    /api/messages');
console.log('   - GET    /api/templates');
console.log('   - GET    /api/analytics/dashboard');

console.log('\n' + '='.repeat(50));
console.log('🔗 WhatsApp OAuth Routes:');
console.log('='.repeat(50));
console.log('   - GET    /api/whatsapp/oauth/init');
console.log('   - GET    /api/whatsapp/oauth/callback');
console.log('   - GET    /api/whatsapp/oauth/accounts');
console.log('   - DELETE /api/whatsapp/oauth/accounts/:accountId');

console.log('\n' + '='.repeat(50));
console.log('🔑 API Key Management Routes:');
console.log('='.repeat(50));
console.log('   - POST   /api/keys (Create API key)');
console.log('   - GET    /api/keys (List API keys)');
console.log('   - DELETE /api/keys/:keyId (Delete API key)');
console.log('   - PUT    /api/keys/:keyId (Update API key)');

console.log('\n' + '='.repeat(50));
console.log('🌐 Public API v1 Routes (API Key Auth):');
console.log('='.repeat(50));
console.log('   - GET    /api/v1 (API Info)');
console.log('   - POST   /api/v1/messages/send');
console.log('   - POST   /api/v1/messages/template');
console.log('   - POST   /api/v1/messages/bulk');
console.log('   - GET    /api/v1/messages/:messageId/status');
console.log('   - GET    /api/v1/messages/history');

console.log('\n' + '='.repeat(50));
console.log('⚙️  Configuration Status:');
console.log('='.repeat(50));
console.log('   💡 Razorpay: ' + (process.env.RAZORPAY_KEY_ID ? '✅ Configured' : '⚠️ Not configured'));
console.log('   💡 Meta App: ' + (process.env.META_APP_ID ? '✅ Configured' : '⚠️ Not configured'));
console.log('   💡 Frontend URL: ' + (process.env.FRONTEND_URL || 'Not set'));
console.log('   💡 Environment: ' + (process.env.NODE_ENV || 'development'));
console.log('='.repeat(50) + '\n');

// ==================== 404 HANDLER ====================
app.use((req, res) => {
    console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.originalUrl}`,
        availableEndpoints: {
            dashboard: '/api',
            publicApi: '/api/v1',
            health: '/health'
        }
    });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
    
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ==================== EXPORT APP ====================
module.exports = app;