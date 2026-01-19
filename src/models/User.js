const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['super_admin', 'owner', 'admin', 'agent', 'user'],
        default: 'user'
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: function() {
            return this.role !== 'super_admin';
        }
    },
    permissions: {
        canSendMessages: { type: Boolean, default: true },
        canManageContacts: { type: Boolean, default: true },
        canManageTemplates: { type: Boolean, default: true },
        canManageUsers: { type: Boolean, default: false },
        canManageSettings: { type: Boolean, default: false },
        canViewReports: { type: Boolean, default: true },
        canManageBilling: { type: Boolean, default: false },
        canViewAllTenants: { type: Boolean, default: false }
    },
    isSuperAdmin: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastLogin: Date,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-set permissions based on role
userSchema.pre('save', function(next) {
    if (this.isNew || this.isModified('role')) {
        switch(this.role) {
            case 'super_admin':
                this.isSuperAdmin = true;
                this.permissions = {
                    canSendMessages: true,
                    canManageContacts: true,
                    canManageTemplates: true,
                    canManageUsers: true,
                    canManageSettings: true,
                    canViewReports: true,
                    canManageBilling: true,
                    canViewAllTenants: true
                };
                break;
            case 'owner':
                this.isSuperAdmin = false;
                this.permissions = {
                    canSendMessages: true,
                    canManageContacts: true,
                    canManageTemplates: true,
                    canManageUsers: true,
                    canManageSettings: true,
                    canViewReports: true,
                    canManageBilling: true,
                    canViewAllTenants: false
                };
                break;
            case 'admin':
                this.isSuperAdmin = false;
                this.permissions = {
                    canSendMessages: true,
                    canManageContacts: true,
                    canManageTemplates: true,
                    canManageUsers: true,
                    canManageSettings: false,
                    canViewReports: true,
                    canManageBilling: false,
                    canViewAllTenants: false
                };
                break;
            case 'agent':
                this.isSuperAdmin = false;
                this.permissions = {
                    canSendMessages: true,
                    canManageContacts: false,
                    canManageTemplates: false,
                    canManageUsers: false,
                    canManageSettings: false,
                    canViewReports: false,
                    canManageBilling: false,
                    canViewAllTenants: false
                };
                break;
            default:
                this.isSuperAdmin = false;
                this.permissions = {
                    canSendMessages: false,
                    canManageContacts: false,
                    canManageTemplates: false,
                    canManageUsers: false,
                    canManageSettings: false,
                    canViewReports: true,
                    canManageBilling: false,
                    canViewAllTenants: false
                };
        }
    }
    next();
});

module.exports = mongoose.model('User', userSchema);