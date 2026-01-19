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

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('✅ Token verified - User ID:', decoded.id);
        console.log('✅ Token data:', {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
            isSuperAdmin: decoded.isSuperAdmin
        });
        
        // ✅ FIXED: Set req.user with correct fields
        req.user = {
            id: decoded.id,  // ✅ Use 'id' (matches JWT creation)
            userId: decoded.id,  // ✅ Also set userId for backward compatibility
            tenantId: decoded.tenantId,
            email: decoded.email,
            role: decoded.role,
            isSuperAdmin: decoded.isSuperAdmin || false
        };
        
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
            message: 'Invalid or expired token'
        });
    }
};

module.exports = { authenticateToken };