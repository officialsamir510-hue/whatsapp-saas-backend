const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');

// Get all users in tenant
router.get('/', authenticateToken, async (req, res) => {
    try {
        const users = await User.find({ 
            tenantId: req.user.tenantId
        })
        .select('-password')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: users
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users'
        });
    }
});

// Invite new user
router.post('/invite', authenticateToken, async (req, res) => {
    try {
        const { name, email, role } = req.body;

        if (!name || !email || !role) {
            return res.status(400).json({
                success: false,
                message: 'Name, email and role are required'
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        const tempPassword = crypto.randomBytes(8).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            role,
            tenantId: req.user.tenantId,
            invitedBy: req.user.userId,
            isActive: true
        });

        await newUser.save();

        console.log(`✅ User invited: ${email} | Temp password: ${tempPassword}`);

        res.status(201).json({
            success: true,
            message: 'User invited successfully',
            data: {
                user: {
                    id: newUser._id,
                    name: newUser.name,
                    email: newUser.email,
                    role: newUser.role
                },
                tempPassword
            }
        });
    } catch (error) {
        console.error('Invite user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to invite user'
        });
    }
});

// Delete user
router.delete('/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.role === 'owner' || user.role === 'super_admin') {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete owner account'
            });
        }

        user.isActive = false;
        await user.save();

        res.json({
            success: true,
            message: 'User deactivated successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user'
        });
    }
});

module.exports = router;