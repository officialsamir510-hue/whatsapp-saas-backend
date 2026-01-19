const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const Tenant = require('../models/Tenant');

// ==================== RAZORPAY INITIALIZATION (SAFE) ====================
let razorpay = null;

if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('✅ Razorpay initialized');
    
    // Test connection
    razorpay.orders.all({ count: 1 })
        .then(() => console.log('✅ Razorpay connected successfully'))
        .catch(err => console.error('⚠️ Razorpay connection test failed:', err.message));
} else {
    console.log('⚠️ Razorpay not configured - payment features disabled');
}

// ==================== MIDDLEWARE - CHECK RAZORPAY ====================
const checkRazorpay = (req, res, next) => {
    if (!razorpay) {
        return res.status(503).json({
            success: false,
            message: 'Payment service not configured. Please contact admin.'
        });
    }
    next();
};

// ==================== CONFIGURATION ====================
const PLANS = {
    free: {
        name: 'Free',
        price: { monthly: 0, yearly: 0 },
        credits: 100
    },
    starter: {
        name: 'Starter',
        price: { monthly: 999, yearly: 9990 },
        credits: 1000,
        savings: { yearly: 1998 }
    },
    professional: {
        name: 'Professional',
        price: { monthly: 2499, yearly: 24990 },
        credits: 5000,
        savings: { yearly: 4998 }
    },
    enterprise: {
        name: 'Enterprise',
        price: { monthly: 4999, yearly: 49990 },
        credits: 15000,
        savings: { yearly: 9998 }
    }
};

const CREDIT_PACKS = {
    pack_100: { credits: 100, price: 99 },
    pack_500: { credits: 500, price: 399 },
    pack_1000: { credits: 1000, price: 699 },
    pack_2500: { credits: 2500, price: 1499 },
    pack_5000: { credits: 5000, price: 2499 }
};

// ==================== GET SUBSCRIPTION ====================
router.get('/subscription', authenticateToken, async (req, res) => {
    try {
        console.log('📊 Getting subscription for tenant:', req.user.tenantId);

        if (req.user.isSuperAdmin) {
            return res.json({
                success: true,
                data: {
                    plan: 'enterprise',
                    messageCredits: 999999,
                    totalMessagesSent: 0,
                    isUnlimited: true
                }
            });
        }

        const tenant = await Tenant.findById(req.user.tenantId);
        
        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        const isExpired = tenant.subscriptionEndDate && new Date(tenant.subscriptionEndDate) < new Date();
        const daysRemaining = tenant.subscriptionEndDate ? 
            Math.max(0, Math.ceil((new Date(tenant.subscriptionEndDate) - new Date()) / (1000 * 60 * 60 * 24))) : null;

        res.json({
            success: true,
            data: {
                plan: tenant.plan || 'free',
                messageCredits: tenant.messageCredits || 0,
                totalMessagesSent: tenant.totalMessagesSent || 0,
                subscriptionDate: tenant.subscriptionDate,
                subscriptionEndDate: tenant.subscriptionEndDate,
                billingPeriod: tenant.billingPeriod,
                isExpired: isExpired,
                daysRemaining: daysRemaining
            }
        });
    } catch (error) {
        console.error('❌ Get subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get subscription'
        });
    }
});

// ==================== CREATE QR CODE FOR PAYMENT ====================
router.post('/create-qr-payment', authenticateToken, checkRazorpay, async (req, res) => {
    try {
        const { planId, billingPeriod } = req.body;
        
        console.log('📱 Creating QR payment:', { planId, billingPeriod });

        if (!PLANS[planId]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan selected'
            });
        }

        const plan = PLANS[planId];
        const amount = billingPeriod === 'yearly' ? plan.price.yearly : plan.price.monthly;

        // Free plan
        if (amount === 0) {
            await Tenant.findByIdAndUpdate(req.user.tenantId, {
                plan: 'free',
                messageCredits: 100,
                billingPeriod: 'monthly',
                subscriptionDate: new Date()
            });

            return res.json({
                success: true,
                message: 'Switched to Free plan',
                data: { plan: 'free', messageCredits: 100 }
            });
        }

        const tenant = await Tenant.findById(req.user.tenantId);

        // Create QR Code
        const qrCode = await razorpay.qrCode.create({
            type: 'upi_qr',
            name: `${plan.name} Plan`,
            usage: 'single_use',
            fixed_amount: true,
            payment_amount: amount * 100,
            description: `${plan.name} Plan - ${billingPeriod} - ${tenant.name}`,
            close_by: Math.floor(Date.now() / 1000) + 900,
            notes: {
                tenant_id: req.user.tenantId.toString(),
                tenant_name: tenant.name,
                plan_id: planId,
                billing_period: billingPeriod,
                type: 'plan_upgrade'
            }
        });

        console.log('✅ QR Code created:', qrCode.id);

        res.json({
            success: true,
            data: {
                qrCodeId: qrCode.id,
                qrCodeUrl: qrCode.image_url,
                amount: amount,
                planName: plan.name,
                billingPeriod: billingPeriod,
                expiresAt: new Date(qrCode.close_by * 1000)
            }
        });
    } catch (error) {
        console.error('❌ Create QR error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create QR code',
            error: error.error?.description || error.message
        });
    }
});

// ==================== CHECK QR PAYMENT STATUS ====================
router.get('/check-qr-payment/:qrCodeId', authenticateToken, checkRazorpay, async (req, res) => {
    try {
        const { qrCodeId } = req.params;
        
        console.log('🔍 Checking QR payment status:', qrCodeId);

        const qrCode = await razorpay.qrCode.fetch(qrCodeId);
        
        res.json({
            success: true,
            data: {
                status: qrCode.status,
                paymentStatus: qrCode.payments_amount_received > 0 ? 'paid' : 'pending',
                amountReceived: qrCode.payments_amount_received / 100
            }
        });
    } catch (error) {
        console.error('❌ Check QR status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check payment status'
        });
    }
});

// ==================== CREATE PAYMENT LINK ====================
router.post('/create-payment-link', authenticateToken, checkRazorpay, async (req, res) => {
    try {
        const { planId, billingPeriod } = req.body;
        
        console.log('💳 Creating payment link:', { planId, billingPeriod });

        if (!PLANS[planId]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan'
            });
        }

        const plan = PLANS[planId];
        const amount = billingPeriod === 'yearly' ? plan.price.yearly : plan.price.monthly;

        if (amount === 0) {
            await Tenant.findByIdAndUpdate(req.user.tenantId, {
                plan: 'free',
                messageCredits: 100
            });
            
            return res.json({
                success: true,
                message: 'Switched to Free plan',
                data: { plan: 'free', messageCredits: 100 }
            });
        }

        const tenant = await Tenant.findById(req.user.tenantId);

        const paymentLink = await razorpay.paymentLink.create({
            amount: amount * 100,
            currency: 'INR',
            description: `${plan.name} Plan - ${billingPeriod}`,
            customer: {
                name: tenant.name,
                email: tenant.email || `${tenant._id}@temp.com`,
                contact: tenant.phone || ''
            },
            notify: {
                sms: false,
                email: false
            },
            reminder_enable: false,
            callback_url: `${process.env.FRONTEND_URL}/billing?payment=success&planId=${planId}&billingPeriod=${billingPeriod}`,
            callback_method: 'get',
            notes: {
                tenant_id: tenant._id.toString(),
                plan_id: planId,
                billing_period: billingPeriod,
                type: 'plan_upgrade'
            }
        });

        console.log('✅ Payment Link created:', paymentLink.id);

        res.json({
            success: true,
            data: {
                paymentLinkId: paymentLink.id,
                paymentUrl: paymentLink.short_url,
                amount: amount,
                planName: plan.name,
                billingPeriod: billingPeriod
            }
        });
    } catch (error) {
        console.error('❌ Create payment link error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment link',
            error: error.error?.description || error.message
        });
    }
});

// ==================== CHECK PAYMENT LINK STATUS ====================
router.get('/check-payment-link/:linkId', authenticateToken, checkRazorpay, async (req, res) => {
    try {
        const { linkId } = req.params;
        
        console.log('🔍 Checking payment link status:', linkId);

        const paymentLink = await razorpay.paymentLink.fetch(linkId);
        
        res.json({
            success: true,
            data: {
                status: paymentLink.status,
                paymentStatus: paymentLink.status === 'paid' ? 'paid' : 'pending',
                amountPaid: paymentLink.amount_paid / 100
            }
        });
    } catch (error) {
        console.error('❌ Check payment link error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check payment status'
        });
    }
});

// ==================== UPGRADE PLAN ====================
router.post('/upgrade', authenticateToken, checkRazorpay, async (req, res) => {
    try {
        const { planId, billingPeriod } = req.body;
        
        console.log('🔄 Plan upgrade request:', { planId, billingPeriod });

        if (!PLANS[planId]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan selected'
            });
        }

        if (!['monthly', 'yearly'].includes(billingPeriod)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid billing period'
            });
        }

        const plan = PLANS[planId];
        const amount = billingPeriod === 'yearly' ? plan.price.yearly : plan.price.monthly;

        if (amount === 0) {
            const tenant = await Tenant.findByIdAndUpdate(
                req.user.tenantId,
                {
                    plan: 'free',
                    messageCredits: 100,
                    billingPeriod: 'monthly',
                    subscriptionDate: new Date(),
                    subscriptionEndDate: null,
                    updatedAt: new Date()
                },
                { new: true }
            );

            return res.json({
                success: true,
                message: 'Switched to Free plan',
                data: {
                    plan: 'free',
                    messageCredits: 100
                }
            });
        }

        const tenant = await Tenant.findById(req.user.tenantId);
        
        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        const order = await razorpay.orders.create({
            amount: amount * 100,
            currency: 'INR',
            receipt: `upgrade_${planId}_${Date.now()}`,
            notes: {
                tenantId: req.user.tenantId.toString(),
                tenantName: tenant.name,
                planId: planId,
                billingPeriod: billingPeriod,
                type: 'plan_upgrade'
            }
        });

        console.log(`✅ Razorpay order created: ${order.id}`);

        res.json({
            success: true,
            data: {
                orderId: order.id,
                amount: amount,
                currency: 'INR',
                keyId: process.env.RAZORPAY_KEY_ID,
                planId: planId,
                planName: plan.name,
                billingPeriod: billingPeriod
            }
        });
    } catch (error) {
        console.error('❌ Upgrade error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process upgrade request',
            error: error.message
        });
    }
});

// ==================== CREATE PLAN ORDER ====================
router.post('/create-plan-order', authenticateToken, checkRazorpay, async (req, res) => {
    try {
        const { planId, billingPeriod } = req.body;
        
        console.log('💳 Creating plan order:', { planId, billingPeriod });

        if (!PLANS[planId]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan selected'
            });
        }

        if (!['monthly', 'yearly'].includes(billingPeriod)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid billing period'
            });
        }

        const plan = PLANS[planId];
        const amount = billingPeriod === 'yearly' ? plan.price.yearly : plan.price.monthly;

        if (amount === 0) {
            const tenant = await Tenant.findByIdAndUpdate(
                req.user.tenantId,
                {
                    plan: 'free',
                    messageCredits: 100,
                    billingPeriod: 'monthly',
                    subscriptionDate: new Date(),
                    subscriptionEndDate: null,
                    updatedAt: new Date()
                },
                { new: true }
            );

            return res.json({
                success: true,
                data: {
                    free: true,
                    plan: 'free',
                    messageCredits: 100
                }
            });
        }

        const tenant = await Tenant.findById(req.user.tenantId);
        
        const order = await razorpay.orders.create({
            amount: amount * 100,
            currency: 'INR',
            receipt: `plan_${planId}_${Date.now()}`,
            notes: {
                tenantId: req.user.tenantId.toString(),
                tenantName: tenant.name,
                planId: planId,
                billingPeriod: billingPeriod,
                type: 'plan_upgrade'
            }
        });

        console.log(`✅ Razorpay order created: ${order.id}`);

        res.json({
            success: true,
            data: {
                orderId: order.id,
                amount: amount,
                currency: 'INR',
                keyId: process.env.RAZORPAY_KEY_ID,
                planId: planId,
                planName: plan.name,
                billingPeriod: billingPeriod,
                savings: billingPeriod === 'yearly' ? plan.savings?.yearly : 0
            }
        });
    } catch (error) {
        console.error('❌ Create plan order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order'
        });
    }
});

// ==================== VERIFY PLAN PAYMENT ====================
router.post('/verify-plan-payment', authenticateToken, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, billingPeriod } = req.body;
        
        console.log('🔐 Verifying plan payment:', { razorpay_order_id, planId });

        if (planId === 'free' || !razorpay_order_id || !razorpay_payment_id) {
            const tenant = await Tenant.findByIdAndUpdate(
                req.user.tenantId,
                {
                    plan: 'free',
                    messageCredits: 100,
                    billingPeriod: 'monthly',
                    subscriptionDate: new Date(),
                    subscriptionEndDate: null,
                    updatedAt: new Date()
                },
                { new: true }
            );

            return res.json({
                success: true,
                message: 'Switched to Free plan',
                data: {
                    plan: 'free',
                    messageCredits: 100
                }
            });
        }

        // Check if Razorpay is configured for signature verification
        if (!process.env.RAZORPAY_KEY_SECRET) {
            return res.status(503).json({
                success: false,
                message: 'Payment verification not available'
            });
        }

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            console.error('❌ Invalid payment signature');
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        console.log('✅ Payment signature verified');

        const plan = PLANS[planId];
        const daysToAdd = billingPeriod === 'yearly' ? 365 : 30;
        const subscriptionEndDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);

        const tenant = await Tenant.findByIdAndUpdate(
            req.user.tenantId,
            {
                plan: planId,
                messageCredits: plan.credits,
                billingPeriod: billingPeriod,
                subscriptionDate: new Date(),
                subscriptionEndDate: subscriptionEndDate,
                lastPayment: {
                    orderId: razorpay_order_id,
                    paymentId: razorpay_payment_id,
                    amount: billingPeriod === 'yearly' ? plan.price.yearly : plan.price.monthly,
                    date: new Date(),
                    method: 'razorpay'
                },
                updatedAt: new Date()
            },
            { new: true }
        );

        console.log(`✅ Plan upgraded to ${planId}`);

        res.json({
            success: true,
            message: `Successfully upgraded to ${plan.name} plan! 🎉`,
            data: {
                plan: planId,
                messageCredits: tenant.messageCredits,
                subscriptionEndDate: tenant.subscriptionEndDate
            }
        });
    } catch (error) {
        console.error('❌ Verify payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed'
        });
    }
});

// ==================== CREATE CREDITS ORDER ====================
router.post('/create-credits-order', authenticateToken, checkRazorpay, async (req, res) => {
    try {
        const { packId } = req.body;
        
        console.log('💰 Creating credits order:', packId);

        if (!CREDIT_PACKS[packId]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid credit pack'
            });
        }

        const pack = CREDIT_PACKS[packId];
        const tenant = await Tenant.findById(req.user.tenantId);

        const order = await razorpay.orders.create({
            amount: pack.price * 100,
            currency: 'INR',
            receipt: `credits_${packId}_${Date.now()}`,
            notes: {
                tenantId: req.user.tenantId.toString(),
                tenantName: tenant.name,
                packId: packId,
                credits: pack.credits,
                type: 'credits_purchase'
            }
        });

        console.log(`✅ Credits order created: ${order.id}`);

        res.json({
            success: true,
            data: {
                orderId: order.id,
                amount: pack.price,
                currency: 'INR',
                keyId: process.env.RAZORPAY_KEY_ID,
                credits: pack.credits
            }
        });
    } catch (error) {
        console.error('❌ Create credits order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order'
        });
    }
});

// ==================== VERIFY CREDITS PAYMENT ====================
router.post('/verify-credits-payment', authenticateToken, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, packId } = req.body;
        
        console.log('🔐 Verifying credits payment:', { razorpay_order_id, packId });

        // Check if Razorpay is configured
        if (!process.env.RAZORPAY_KEY_SECRET) {
            return res.status(503).json({
                success: false,
                message: 'Payment verification not available'
            });
        }

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        const pack = CREDIT_PACKS[packId];
        const tenant = await Tenant.findByIdAndUpdate(
            req.user.tenantId,
            {
                $inc: { messageCredits: pack.credits },
                $push: {
                    creditPurchases: {
                        orderId: razorpay_order_id,
                        paymentId: razorpay_payment_id,
                        credits: pack.credits,
                        amount: pack.price,
                        date: new Date()
                    }
                },
                updatedAt: new Date()
            },
            { new: true }
        );

        console.log(`✅ Added ${pack.credits} credits`);

        res.json({
            success: true,
            message: `${pack.credits.toLocaleString()} credits added! 🎉`,
            data: {
                creditsAdded: pack.credits,
                totalCredits: tenant.messageCredits
            }
        });
    } catch (error) {
        console.error('❌ Verify credits payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed'
        });
    }
});

// ==================== GET TRANSACTIONS ====================
router.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.user.tenantId);
        const transactions = [];
        
        if (tenant?.lastPayment) {
            transactions.push({
                _id: tenant.lastPayment.paymentId,
                type: 'subscription',
                description: `${tenant.plan} Plan - ${tenant.billingPeriod || 'monthly'}`,
                amount: tenant.lastPayment.amount,
                status: 'completed',
                createdAt: tenant.lastPayment.date
            });
        }
        
        if (tenant?.creditPurchases) {
            tenant.creditPurchases.forEach(purchase => {
                transactions.push({
                    _id: purchase.paymentId,
                    type: 'credits',
                    description: `${purchase.credits} Credits Purchase`,
                    amount: purchase.amount,
                    status: 'completed',
                    createdAt: purchase.date
                });
            });
        }
        
        transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            data: { transactions }
        });
    } catch (error) {
        console.error('❌ Get transactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get transactions'
        });
    }
});

// ==================== CANCEL SUBSCRIPTION ====================
router.post('/cancel-subscription', authenticateToken, async (req, res) => {
    try {
        const tenant = await Tenant.findByIdAndUpdate(
            req.user.tenantId,
            {
                plan: 'free',
                messageCredits: 100,
                billingPeriod: 'monthly',
                subscriptionEndDate: null,
                updatedAt: new Date()
            },
            { new: true }
        );

        res.json({
            success: true,
            message: 'Subscription cancelled. You are now on the Free plan.',
            data: {
                plan: 'free',
                messageCredits: 100
            }
        });
    } catch (error) {
        console.error('❌ Cancel subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel subscription'
        });
    }
});

// ==================== GET PLANS ====================
router.get('/plans', (req, res) => {
    res.json({
        success: true,
        data: PLANS
    });
});

// ==================== GET CREDIT PACKS ====================
router.get('/credit-packs', (req, res) => {
    res.json({
        success: true,
        data: CREDIT_PACKS
    });
});

module.exports = router;