const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true
    },
    role: {
        type: String,
        enum: ['owner', 'admin', 'agent', 'super_admin'],
        default: 'owner'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isSuperAdmin: {
        type: Boolean,
        default: false
    },
    permissions: {
        type: [String],
        default: []
    },
    lastLogin: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ tenantId: 1 });

module.exports = mongoose.model('User', userSchema);