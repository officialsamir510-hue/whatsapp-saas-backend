const Razorpay = require('razorpay');
const crypto = require('crypto');

class RazorpayService {
    constructor() {
        console.log('🔧 Initializing Razorpay...');
        console.log('📌 Key ID:', process.env.RAZORPAY_KEY_ID ? 'Set ✅' : 'Missing ❌');
        console.log('📌 Key Secret:', process.env.RAZORPAY_KEY_SECRET ? 'Set ✅' : 'Missing ❌');
        
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            console.error('❌ Razorpay credentials missing!');
        }
        
        this.razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
    }

    // Create Order
    async createOrder(amount, currency = 'INR', receipt, notes = {}) {
        try {
            console.log('📦 Creating Razorpay order...');
            console.log('   Amount:', amount);
            console.log('   Currency:', currency);
            console.log('   Receipt:', receipt);
            
            // Validate amount
            if (!amount || amount <= 0) {
                throw new Error('Invalid amount');
            }

            const orderData = {
                amount: Math.round(amount * 100), // Convert to paise
                currency: currency,
                receipt: receipt.substring(0, 40), // Receipt max 40 chars
                notes: notes
            };

            console.log('   Order Data:', JSON.stringify(orderData, null, 2));
            
            const order = await this.razorpay.orders.create(orderData);
            
            console.log('✅ Order created successfully:', order.id);
            return { success: true, data: order };
        } catch (error) {
            console.error('❌ Razorpay Create Order Error:');
            console.error('   Error Message:', error.message);
            console.error('   Error Details:', error.error || error);
            
            // Razorpay specific error
            if (error.error) {
                console.error('   Razorpay Error:', JSON.stringify(error.error, null, 2));
            }
            
            return { 
                success: false, 
                error: error.error?.description || error.message 
            };
        }
    }

    // Verify Payment Signature
    verifyPaymentSignature(orderId, paymentId, signature) {
        try {
            const body = `${orderId}|${paymentId}`;
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(body)
                .digest('hex');
            
            const isValid = expectedSignature === signature;
            console.log(`🔐 Signature verification: ${isValid ? 'Valid ✅' : 'Invalid ❌'}`);
            
            return isValid;
        } catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    }

    // Fetch Payment Details
    async fetchPayment(paymentId) {
        try {
            const payment = await this.razorpay.payments.fetch(paymentId);
            return { success: true, data: payment };
        } catch (error) {
            console.error('Fetch Payment Error:', error);
            return { success: false, error: error.message };
        }
    }

    // Test Connection
    async testConnection() {
        try {
            // Try to create a small test order
            const testOrder = await this.razorpay.orders.create({
                amount: 100, // ₹1
                currency: 'INR',
                receipt: 'test_' + Date.now()
            });
            console.log('✅ Razorpay connection test successful');
            return { success: true, orderId: testOrder.id };
        } catch (error) {
            console.error('❌ Razorpay connection test failed:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new RazorpayService();