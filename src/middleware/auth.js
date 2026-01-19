const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        console.log('🔍 Auth middleware - Token exists:', !!token);

        if (!token) {
            console.log('❌ No token provided');
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        console.log('✅ Token verified - User ID:', decoded.userId);
        
        req.user = decoded;
        next();
    } catch (error) {
        console.error('❌ Auth middleware error:', error.message);
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

module.exports = { authenticateToken };