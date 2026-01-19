const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
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
const metaOAuthRoutes = require('./routes/metaOAuthRoutes');  // ✅ YE ADD KARO

// ==================== REGISTER ROUTES ====================
app.use('/api/auth', authRoutes);
app.use('/api/auth/meta', metaOAuthRoutes); 
app.use('/api/billing', billingRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhook', webhookRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// 404 handler
app.use((req, res) => {
    console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
        success: false, 
        message: `Route not found: ${req.originalUrl}` 
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ==================== MONGODB CONNECTION ====================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB Connected');
        console.log(`📍 Database: ${mongoose.connection.name}`);
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err);
        process.exit(1);
    });

// ==================== LOG LOADED ROUTES ====================
console.log('\n📚 Routes Loaded:');
console.log('   - POST   /api/auth/login');
console.log('   - POST   /api/auth/register');
console.log('   - GET    /api/billing/subscription');
console.log('   - POST   /api/billing/create-plan-order');
console.log('   - POST   /api/billing/create-credits-order');
console.log('   - GET    /api/contacts');
console.log('   - GET    /api/messages');
console.log('   - GET    /api/templates');
console.log('   - GET    /api/settings');
console.log('   - GET    /api/users');
console.log('   - GET    /api/admin');
console.log('   - GET    /api/analytics');
console.log('   - POST   /api/webhook');

console.log('\n💡 Razorpay: ' + (process.env.RAZORPAY_KEY_ID ? '✅ Configured' : '⚠️  Not configured'));

// ❌ REMOVE THIS - app.listen() ko yaha se hata do
// app.listen(PORT, () => { ... });  // DELETE THIS

// ✅ Only export app
module.exports = app;