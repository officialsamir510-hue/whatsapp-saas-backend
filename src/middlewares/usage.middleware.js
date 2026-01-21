const Usage = require('../models/Usage');
const User = require('../models/User');

const trackUsage = async (req, res, next) => {
    // Run tracking after response (non-blocking)
    res.on('finish', async () => {
        try {
            if (!req.user || !req.tenant) return;
            
            const userId = req.user._id;
            const tenantId = req.tenant._id;
            const currentMonth = new Date().toISOString().slice(0, 7); // "2024-01"
            
            // Track API call
            await Usage.findOneAndUpdate(
                { userId, month: currentMonth },
                {
                    tenantId,
                    $inc: { apiCalls: 1 }
                },
                { upsert: true }
            );
            
            // If message sent, track that too
            if (req.method === 'POST' && req.path.includes('/send')) {
                // Increment message count
                await User.findByIdAndUpdate(userId, {
                    $inc: { 'currentUsage.messagesSent': 1 }
                });
                
                await Usage.findOneAndUpdate(
                    { userId, month: currentMonth },
                    {
                        $inc: { messagesSent: 1 }
                    }
                );
            }
            
        } catch (error) {
            console.error('Usage tracking error:', error);
            // Don't block the request
        }
    });
    
    next();
};

module.exports = { trackUsage };