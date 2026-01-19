require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');

const SUPER_ADMIN_EMAIL = 'admin@yourapp.com';  // ← Change this
const SUPER_ADMIN_PASSWORD = 'Admin@12345';      // ← Change this

async function createSuperAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-saas');
        console.log('✅ Connected to MongoDB');

        // Check if super admin exists
        const existing = await User.findOne({ email: SUPER_ADMIN_EMAIL });
        
        if (existing) {
            console.log('⚠️ Super admin already exists!');
            
            // Update to super admin role if needed
            if (!existing.isSuperAdmin) {
                existing.role = 'super_admin';
                existing.isSuperAdmin = true;
                await existing.save();
                console.log('✅ Updated existing user to super admin');
            }
        } else {
            // Create new super admin
            const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
            
            const superAdmin = new User({
                name: 'Super Admin',
                email: SUPER_ADMIN_EMAIL,
                password: hashedPassword,
                role: 'super_admin',
                isSuperAdmin: true,
                isActive: true
                // No tenantId - super admin doesn't belong to any tenant
            });

            await superAdmin.save();
            console.log('✅ Super admin created successfully!');
            console.log('📧 Email:', SUPER_ADMIN_EMAIL);
            console.log('🔑 Password:', SUPER_ADMIN_PASSWORD);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

createSuperAdmin();