const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        console.log('🔍 Auth middleware - Token exists:', !!token);

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // ✅ FIXED: Use 'id' (matches JWT creation)
        console.log('✅ Token verified - User ID:', decoded.id);

        req.user = {
            id: decoded.id,
            userId: decoded.id,
            tenantId: decoded.tenantId,
            email: decoded.email,
            role: decoded.role,
            isSuperAdmin: decoded.isSuperAdmin || false
        };

        if (!req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        next();

    } catch (error) {
        console.error('❌ Auth error:', error.message);
        return res.status(401).json({
            success: false,
            message: 'Token verification failed'
        });
    }
};

module.exports = { authenticateToken };