const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

// Get all settings
router.get('/', authenticateToken, async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.user.tenantId).select('-apiKey');
        
        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        res.json({
            success: true,
            data: {
                whatsappConfig: tenant.whatsappConfig || {},
                webhookConfig: {
                    webhookUrl: tenant.webhookUrl || '',
                    verifyToken: tenant.verifyToken || 'wabmeta_whatsapp_1617'
                }
            }
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch settings'
        });
    }
});

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { name, email, company } = req.body;

        // Check if email already exists (if changing email)
        if (email !== req.user.email) {
            const existingUser = await User.findOne({ email, _id: { $ne: req.user.userId } });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already exists'
                });
            }
        }

        // Update user
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            { 
                name,
                email,
                updatedAt: new Date()
            },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update tenant company name
        if (company) {
            await Tenant.findByIdAndUpdate(
                req.user.tenantId,
                { 
                    company,
                    updatedAt: new Date()
                }
            );
        }

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: user
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
});

// Update WhatsApp configuration
router.put('/whatsapp', authenticateToken, async (req, res) => {
    try {
        const { phoneNumberId, businessAccountId, accessToken } = req.body;

        const tenant = await Tenant.findByIdAndUpdate(
            req.user.tenantId,
            {
                whatsappConfig: {
                    phoneNumberId: phoneNumberId || '',
                    businessAccountId: businessAccountId || '',
                    accessToken: accessToken || ''
                },
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        res.json({
            success: true,
            message: 'WhatsApp configuration updated successfully',
            data: {
                phoneNumberId: tenant.whatsappConfig?.phoneNumberId,
                businessAccountId: tenant.whatsappConfig?.businessAccountId,
                accessTokenSet: !!tenant.whatsappConfig?.accessToken
            }
        });
    } catch (error) {
        console.error('Update WhatsApp config error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update WhatsApp configuration'
        });
    }
});

// Update webhook configuration
router.put('/webhook', authenticateToken, async (req, res) => {
    try {
        const { webhookUrl, verifyToken } = req.body;

        const tenant = await Tenant.findByIdAndUpdate(
            req.user.tenantId,
            {
                webhookUrl: webhookUrl || '',
                verifyToken: verifyToken || 'wabmeta_whatsapp_1617',
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        res.json({
            success: true,
            message: 'Webhook configuration updated successfully',
            data: {
                webhookUrl: tenant.webhookUrl,
                verifyToken: tenant.verifyToken
            }
        });
    } catch (error) {
        console.error('Update webhook config error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update webhook configuration'
        });
    }
});

// Test webhook
router.post('/webhook/test', authenticateToken, async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.user.tenantId);
        
        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        if (!tenant.webhookUrl) {
            return res.status(400).json({
                success: false,
                message: 'Webhook URL not configured'
            });
        }

        res.json({
            success: true,
            message: 'Webhook configuration is valid',
            data: {
                webhookUrl: tenant.webhookUrl,
                verifyToken: tenant.verifyToken,
                status: 'configured'
            }
        });
    } catch (error) {
        console.error('Test webhook error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to test webhook'
        });
    }
});

// Change password
router.put('/password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Validation
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        // Get user with password
        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password
        user.password = hashedPassword;
        user.updatedAt = new Date();
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to change password'
        });
    }
});

// Get usage statistics
router.get('/usage', authenticateToken, async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.user.tenantId);
        
        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        res.json({
            success: true,
            data: {
                messageCredits: tenant.messageCredits || 0,
                totalMessagesSent: tenant.totalMessagesSent || 0,
                plan: tenant.plan || 'free',
                createdAt: tenant.createdAt
            }
        });
    } catch (error) {
        console.error('Get usage error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch usage statistics'
        });
    }
});

module.exports = router;