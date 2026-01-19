const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Message = require('../models/Message');
const Contact = require('../models/Contact');

// Middleware to check super admin
const isSuperAdmin = (req, res, next) => {
    if (!req.user.isSuperAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Super admin access required'
        });
    }
    next();
};

// Get all tenants
router.get('/tenants', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const tenants = await Tenant.find().sort({ createdAt: -1 });
        
        // Get user count for each tenant
        const tenantsWithStats = await Promise.all(
            tenants.map(async (tenant) => {
                const userCount = await User.countDocuments({ tenantId: tenant._id });
                const messageCount = await Message.countDocuments({ tenantId: tenant._id });
                const contactCount = await Contact.countDocuments({ tenantId: tenant._id });
                
                return {
                    ...tenant.toObject(),
                    stats: {
                        users: userCount,
                        messages: messageCount,
                        contacts: contactCount
                    }
                };
            })
        );

        res.json({
            success: true,
            data: tenantsWithStats
        });
    } catch (error) {
        console.error('Get tenants error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tenants'
        });
    }
});

// Get all users (across all tenants)
router.get('/users', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const users = await User.find({ isSuperAdmin: false })
            .populate('tenantId', 'name company')
            .select('-password')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: users
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users'
        });
    }
});

// Get dashboard stats
router.get('/stats', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const totalTenants = await Tenant.countDocuments();
        const totalUsers = await User.countDocuments({ isSuperAdmin: false });
        const totalMessages = await Message.countDocuments();
        const totalContacts = await Contact.countDocuments();
        
        const activeTenants = await Tenant.countDocuments({ isActive: true });
        const activeUsers = await User.countDocuments({ isActive: true, isSuperAdmin: false });

        res.json({
            success: true,
            data: {
                tenants: {
                    total: totalTenants,
                    active: activeTenants
                },
                users: {
                    total: totalUsers,
                    active: activeUsers
                },
                messages: {
                    total: totalMessages
                },
                contacts: {
                    total: totalContacts
                }
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics'
        });
    }
});

// Update tenant
router.put('/tenants/:tenantId', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { plan, messageCredits, isActive } = req.body;

        const updateData = {};
        if (plan) updateData.plan = plan;
        if (messageCredits !== undefined) updateData.messageCredits = messageCredits;
        if (isActive !== undefined) updateData.isActive = isActive;
        updateData.updatedAt = new Date();

        const tenant = await Tenant.findByIdAndUpdate(
            tenantId,
            updateData,
            { new: true }
        );

        res.json({
            success: true,
            message: 'Tenant updated successfully',
            data: tenant
        });
    } catch (error) {
        console.error('Update tenant error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update tenant'
        });
    }
});

// Delete tenant
router.delete('/tenants/:tenantId', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { tenantId } = req.params;

        // Deactivate tenant
        await Tenant.findByIdAndUpdate(tenantId, { isActive: false });
        
        // Deactivate all users in tenant
        await User.updateMany(
            { tenantId },
            { isActive: false }
        );

        res.json({
            success: true,
            message: 'Tenant deactivated successfully'
        });
    } catch (error) {
        console.error('Delete tenant error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete tenant'
        });
    }
});

module.exports = router;