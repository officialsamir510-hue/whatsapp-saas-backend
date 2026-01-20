const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        console.log('🔍 Auth Check - Token exists:', !!token);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        console.log('✅ Token verified - User ID:', decoded.id);

        // Set user info in request
        req.user = {
            id: decoded.id,
            userId: decoded.id,
            tenantId: decoded.tenantId,
            email: decoded.email,
            role: decoded.role,
            isSuperAdmin: decoded.isSuperAdmin || false
        };

        next();

    } catch (error) {
        console.error('❌ Auth error:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
};

module.exports = { authenticateToken };