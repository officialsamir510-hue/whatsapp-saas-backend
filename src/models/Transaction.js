const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    tenant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Razorpay details
    razorpay: {
        orderId: String,
        paymentId: String,
        signature: String
    },
    
    // Transaction details
    type: {
        type: String,
        enum: ['subscription', 'credits', 'addon', 'refund'],
        required: true
    },
    
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    
    // What was purchased
    description: String,
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan'
    },
    credits: Number,
    billingPeriod: {
        type: String,
        enum: ['monthly', 'yearly']
    },
    
    // Status
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    
    // Invoice
    invoiceNumber: String,
    invoiceUrl: String,
    
    // Metadata
    metadata: mongoose.Schema.Types.Mixed
}, {
    timestamps: true
});

// Auto-generate invoice number
transactionSchema.pre('save', async function(next) {
    if (!this.invoiceNumber && this.status === 'completed') {
        const count = await mongoose.model('Transaction').countDocuments();
        this.invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;
    }
    next();
});

module.exports = mongoose.model('Transaction', transactionSchema);