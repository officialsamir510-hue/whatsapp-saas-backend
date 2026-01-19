const razorpayService = require('../services/razorpayService');
const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const Transaction = require('../models/Transaction');
const Message = require('../models/Message');

// Get Plans
exports.getPlans = async (req, res) => {
    try {
        const plans = await Plan.find({ isActive: true }).sort({ displayOrder: 1 });
        res.json({ success: true, data: plans });
    } catch (error) {
        console.error('Get Plans Error:', error);
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
};

// Create Order for Plan Purchase
exports.createOrder = async (req, res) => {
    try {
        console.log('📥 Create Order Request:', req.body);
        
        const { planId, billingPeriod } = req.body;
        
        if (!planId) {
            return res.status(400).json({ error: 'Plan ID is required' });
        }
        
        if (!billingPeriod) {
            return res.status(400).json({ error: 'Billing period is required' });
        }

        const tenant = await Tenant.findById(req.user.tenant);
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        const plan = await Plan.findById(planId);
        if (!plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        if (plan.price.monthly === 0) {
            return res.status(400).json({ error: 'Cannot purchase free plan' });
        }

        const amount = billingPeriod === 'yearly' ? plan.price.yearly : plan.price.monthly;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid plan amount' });
        }

        const receipt = `plan_${Date.now()}`;

        console.log(`💰 Creating plan order: ₹${amount} for ${plan.name}`);

        const result = await razorpayService.createOrder(amount, 'INR', receipt, {
            tenantId: tenant._id.toString(),
            planId: plan._id.toString(),
            planName: plan.name,
            billingPeriod
        });

        if (!result.success) {
            console.error('❌ Razorpay order failed:', result.error);
            return res.status(400).json({ 
                error: 'Failed to create order', 
                details: result.error 
            });
        }

        // Create pending transaction
        await Transaction.create({
            tenant: tenant._id,
            user: req.user.id,
            razorpay: { orderId: result.data.id },
            type: 'subscription',
            amount: amount,
            plan: plan._id,
            billingPeriod,
            description: `${plan.name} Plan - ${billingPeriod}`,
            status: 'pending'
        });

        console.log(`✅ Order created: ${result.data.id}`);

        res.json({
            success: true,
            data: {
                orderId: result.data.id,
                amount: amount,
                currency: 'INR',
                keyId: process.env.RAZORPAY_KEY_ID
            }
        });
    } catch (error) {
        console.error('❌ Create Order Error:', error);
        res.status(500).json({ 
            error: 'Failed to create order',
            details: error.message 
        });
    }
};

// Verify Payment
exports.verifyPayment = async (req, res) => {
    try {
        console.log('📥 Verify Payment Request:', req.body);
        
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Missing payment details' });
        }

        console.log(`🔐 Verifying payment: ${razorpay_payment_id}`);

        // Verify signature
        const isValid = razorpayService.verifyPaymentSignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (!isValid) {
            console.error('❌ Invalid payment signature');
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        // Update transaction
        const transaction = await Transaction.findOneAndUpdate(
            { 'razorpay.orderId': razorpay_order_id },
            {
                $set: {
                    'razorpay.paymentId': razorpay_payment_id,
                    'razorpay.signature': razorpay_signature,
                    status: 'completed'
                }
            },
            { new: true }
        ).populate('plan');

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Update tenant plan
        const planDuration = transaction.billingPeriod === 'yearly' ? 365 : 30;
        const planExpiry = new Date();
        planExpiry.setDate(planExpiry.getDate() + planDuration);

        await Tenant.findByIdAndUpdate(transaction.tenant, {
            $set: {
                plan: transaction.plan.slug,
                planExpiry: planExpiry
            },
            $inc: {
                messageCredits: transaction.plan.features.messagesPerMonth
            }
        });

        console.log(`✅ Payment verified and plan upgraded`);

        res.json({
            success: true,
            message: 'Payment verified successfully',
            data: {
                transactionId: transaction._id,
                plan: transaction.plan.name,
                expiry: planExpiry
            }
        });
    } catch (error) {
        console.error('❌ Verify Payment Error:', error);
        res.status(500).json({ error: 'Payment verification failed' });
    }
};

// Buy Message Credits
exports.buyCredits = async (req, res) => {
    try {
        console.log('📥 Buy Credits Request:', req.body);
        
        const { credits, amount } = req.body;

        if (!credits || credits <= 0) {
            return res.status(400).json({ error: 'Invalid credits amount' });
        }
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const tenant = await Tenant.findById(req.user.tenant);
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        const receipt = `cred_${Date.now()}`;

        console.log(`💰 Creating credits order: ${credits} credits for ₹${amount}`);

        const result = await razorpayService.createOrder(amount, 'INR', receipt, {
            tenantId: tenant._id.toString(),
            credits: credits,
            type: 'credits'
        });

        if (!result.success) {
            console.error('❌ Razorpay order failed:', result.error);
            return res.status(400).json({ 
                error: 'Failed to create order',
                details: result.error 
            });
        }

        // Create pending transaction
        await Transaction.create({
            tenant: tenant._id,
            user: req.user.id,
            razorpay: { orderId: result.data.id },
            type: 'credits',
            amount: amount,
            credits: credits,
            description: `${credits} Message Credits`,
            status: 'pending'
        });

        console.log(`✅ Credits order created: ${result.data.id}`);

        res.json({
            success: true,
            data: {
                orderId: result.data.id,
                amount: amount,
                currency: 'INR',
                keyId: process.env.RAZORPAY_KEY_ID
            }
        });
    } catch (error) {
        console.error('❌ Buy Credits Error:', error);
        res.status(500).json({ 
            error: 'Failed to create credits order',
            details: error.message 
        });
    }
};

// Verify Credits Payment
exports.verifyCreditsPayment = async (req, res) => {
    try {
        console.log('📥 Verify Credits Request:', req.body);
        
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Missing payment details' });
        }

        console.log(`🔐 Verifying credits payment: ${razorpay_payment_id}`);

        const isValid = razorpayService.verifyPaymentSignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        );

        if (!isValid) {
            console.error('❌ Invalid payment signature');
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        const transaction = await Transaction.findOneAndUpdate(
            { 'razorpay.orderId': razorpay_order_id },
            {
                $set: {
                    'razorpay.paymentId': razorpay_payment_id,
                    'razorpay.signature': razorpay_signature,
                    status: 'completed'
                }
            },
            { new: true }
        );

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Add credits to tenant
        const updatedTenant = await Tenant.findByIdAndUpdate(
            transaction.tenant,
            { $inc: { messageCredits: transaction.credits } },
            { new: true }
        );

        console.log(`✅ Credits payment verified. New balance: ${updatedTenant.messageCredits}`);

        res.json({
            success: true,
            message: 'Credits added successfully',
            data: {
                creditsAdded: transaction.credits,
                totalCredits: updatedTenant.messageCredits
            }
        });
    } catch (error) {
        console.error('❌ Verify Credits Error:', error);
        res.status(500).json({ error: 'Credits verification failed' });
    }
};

// Get Transaction History
exports.getTransactions = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const transactions = await Transaction.find({ tenant: req.user.tenant })
            .populate('plan', 'name slug')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Transaction.countDocuments({ tenant: req.user.tenant });

        res.json({
            success: true,
            data: {
                transactions,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get Transactions Error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
};

// Get Current Usage
exports.getUsage = async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.user.tenant);
        
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const monthlyMessages = await Message.countDocuments({
            tenant: tenant._id,
            direction: 'outbound',
            createdAt: { $gte: startOfMonth }
        });

        res.json({
            success: true,
            data: {
                plan: tenant.plan,
                planExpiry: tenant.planExpiry,
                messageCredits: tenant.messageCredits,
                totalMessagesSent: tenant.totalMessagesSent,
                thisMonthMessages: monthlyMessages
            }
        });
    } catch (error) {
        console.error('Get Usage Error:', error);
        res.status(500).json({ error: 'Failed to fetch usage' });
    }
};

// Test Razorpay Connection
exports.testRazorpay = async (req, res) => {
    try {
        const result = await razorpayService.testConnection();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};