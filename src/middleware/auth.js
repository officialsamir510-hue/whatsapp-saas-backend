// src/middleware/auth.js

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

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // ✅ FIXED: Use 'id' not 'userId' (matches JWT creation)
        console.log('✅ Token verified - User ID:', decoded.id);
        console.log('✅ Token payload:', {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
            tenantId: decoded.tenantId
        });

        // ✅ FIXED: Set req.user with correct field names
        req.user = {
            id: decoded.id,           // ✅ Primary ID
            userId: decoded.id,       // ✅ Alias for backward compatibility
            tenantId: decoded.tenantId,
            email: decoded.email,
            role: decoded.role,
            isSuperAdmin: decoded.isSuperAdmin || false
        };

        // Validate ID exists
        if (!req.user.id) {
            console.error('❌ CRITICAL: Token has no user ID!');
            return res.status(401).json({
                success: false,
                message: 'Invalid token - no user ID'
            });
        }

        console.log('✅ Auth middleware passed - User:', req.user.email);
        next();

    } catch (error) {
        console.error('❌ Auth middleware error:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        return res.status(403).json({
            success: false,
            message: 'Token verification failed'
        });
    }
};

module.exports = { authenticateToken };