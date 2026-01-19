const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ error: 'Not authorized, no token' });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password').populate('tenant');

            if (!req.user) {
                return res.status(401).json({ error: 'User not found' });
            }

            next();
        } catch (error) {
            return res.status(401).json({ error: 'Token invalid' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
};

module.exports = { protect, admin };