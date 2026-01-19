const Contact = require('../models/Contact');
const Message = require('../models/Message');

// Get All Contacts
exports.getContacts = async (req, res) => {
    try {
        const { page = 1, limit = 50, search, tag } = req.query;
        const query = { tenant: req.user.tenant };
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (tag) {
            query.tags = tag;
        }

        const contacts = await Contact.find(query)
            .sort({ 'stats.lastMessageAt': -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Contact.countDocuments(query);

        res.json({
            success: true,
            data: {
                contacts,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get Contacts Error:', error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
};

// Get Single Contact
exports.getContact = async (req, res) => {
    try {
        const contact = await Contact.findOne({
            _id: req.params.id,
            tenant: req.user.tenant
        });

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        const recentMessages = await Message.find({
            tenant: req.user.tenant,
            $or: [{ from: contact.waId }, { to: contact.waId }]
        })
            .sort({ createdAt: -1 })
            .limit(50);

        res.json({
            success: true,
            data: { contact, recentMessages }
        });
    } catch (error) {
        console.error('Get Contact Error:', error);
        res.status(500).json({ error: 'Failed to fetch contact' });
    }
};

// Create Contact
exports.createContact = async (req, res) => {
    try {
        const { name, phone, email, tags, notes, customFields } = req.body;

        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        // Clean phone number
        const waId = phone.toString().replace(/[\s+\-\(\)]/g, '');

        // Check if contact exists
        const existing = await Contact.findOne({
            tenant: req.user.tenant,
            waId: waId
        });

        if (existing) {
            return res.status(400).json({ error: 'Contact already exists' });
        }

        const contact = await Contact.create({
            tenant: req.user.tenant,
            waId: waId,
            phone: waId,
            name: name || '',
            email: email || '',
            tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []),
            notes: notes || '',
            customFields: customFields || {},
            optIn: {
                status: true,
                timestamp: new Date(),
                source: 'manual'
            }
        });

        res.status(201).json({
            success: true,
            data: contact
        });
    } catch (error) {
        console.error('Create Contact Error:', error);
        res.status(500).json({ error: 'Failed to create contact' });
    }
};

// Update Contact
exports.updateContact = async (req, res) => {
    try {
        const { name, email, tags, notes, customFields, isBlocked } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (notes !== undefined) updateData.notes = notes;
        if (customFields !== undefined) updateData.customFields = customFields;
        if (isBlocked !== undefined) updateData.isBlocked = isBlocked;
        if (tags !== undefined) {
            updateData.tags = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean);
        }

        const contact = await Contact.findOneAndUpdate(
            { _id: req.params.id, tenant: req.user.tenant },
            { $set: updateData },
            { new: true }
        );

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        res.json({
            success: true,
            data: contact
        });
    } catch (error) {
        console.error('Update Contact Error:', error);
        res.status(500).json({ error: 'Failed to update contact' });
    }
};

// Delete Contact
exports.deleteContact = async (req, res) => {
    try {
        const contact = await Contact.findOneAndDelete({
            _id: req.params.id,
            tenant: req.user.tenant
        });

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        res.json({
            success: true,
            message: 'Contact deleted successfully'
        });
    } catch (error) {
        console.error('Delete Contact Error:', error);
        res.status(500).json({ error: 'Failed to delete contact' });
    }
};

// Add Tags to Contact
exports.addTags = async (req, res) => {
    try {
        const { tags } = req.body;

        if (!tags || !Array.isArray(tags)) {
            return res.status(400).json({ error: 'Tags array is required' });
        }

        const contact = await Contact.findOneAndUpdate(
            { _id: req.params.id, tenant: req.user.tenant },
            { $addToSet: { tags: { $each: tags } } },
            { new: true }
        );

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        res.json({
            success: true,
            data: contact
        });
    } catch (error) {
        console.error('Add Tags Error:', error);
        res.status(500).json({ error: 'Failed to add tags' });
    }
};

// Remove Tags from Contact
exports.removeTags = async (req, res) => {
    try {
        const { tags } = req.body;

        if (!tags || !Array.isArray(tags)) {
            return res.status(400).json({ error: 'Tags array is required' });
        }

        const contact = await Contact.findOneAndUpdate(
            { _id: req.params.id, tenant: req.user.tenant },
            { $pull: { tags: { $in: tags } } },
            { new: true }
        );

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        res.json({
            success: true,
            data: contact
        });
    } catch (error) {
        console.error('Remove Tags Error:', error);
        res.status(500).json({ error: 'Failed to remove tags' });
    }
};

// Get All Tags
exports.getAllTags = async (req, res) => {
    try {
        const tags = await Contact.distinct('tags', { tenant: req.user.tenant });
        res.json({
            success: true,
            data: tags.filter(Boolean) // Remove empty tags
        });
    } catch (error) {
        console.error('Get Tags Error:', error);
        res.status(500).json({ error: 'Failed to fetch tags' });
    }
};

// Import Contacts (Bulk)
exports.importContacts = async (req, res) => {
    try {
        const { contacts } = req.body;

        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ error: 'No contacts provided' });
        }

        console.log(`📥 Importing ${contacts.length} contacts`);

        const results = {
            imported: 0,
            updated: 0,
            skipped: 0,
            errors: []
        };

        for (const contactData of contacts) {
            try {
                // Clean phone number
                let phone = contactData.phone;
                if (!phone) {
                    results.skipped++;
                    continue;
                }

                // Remove all non-numeric characters except +
                phone = phone.toString().replace(/[^\d+]/g, '');
                
                // Remove leading + if present
                if (phone.startsWith('+')) {
                    phone = phone.substring(1);
                }

                // Skip if phone is too short
                if (phone.length < 10) {
                    results.errors.push({
                        phone: contactData.phone,
                        error: 'Phone number too short'
                    });
                    continue;
                }

                const waId = phone;

                // Prepare tags
                let tags = [];
                if (contactData.tags) {
                    if (Array.isArray(contactData.tags)) {
                        tags = contactData.tags;
                    } else if (typeof contactData.tags === 'string') {
                        tags = contactData.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean);
                    }
                }

                // Check if contact exists
                const existingContact = await Contact.findOne({ 
                    tenant: req.user.tenant, 
                    waId: waId 
                });

                if (existingContact) {
                    // Update existing
                    await Contact.findOneAndUpdate(
                        { tenant: req.user.tenant, waId: waId },
                        {
                            $set: {
                                name: contactData.name || existingContact.name,
                                email: contactData.email || existingContact.email,
                            },
                            $addToSet: { tags: { $each: tags } }
                        }
                    );
                    results.updated++;
                } else {
                    // Create new
                    await Contact.create({
                        tenant: req.user.tenant,
                        waId: waId,
                        phone: waId,
                        name: contactData.name || '',
                        email: contactData.email || '',
                        tags: tags,
                        optIn: {
                            status: true,
                            timestamp: new Date(),
                            source: 'csv_import'
                        }
                    });
                    results.imported++;
                }
            } catch (err) {
                console.error('Import contact error:', err);
                results.errors.push({
                    phone: contactData.phone,
                    error: err.message
                });
            }
        }

        console.log(`✅ Import complete:`, results);

        res.json({
            success: true,
            message: `Import complete: ${results.imported} new, ${results.updated} updated`,
            data: results
        });
    } catch (error) {
        console.error('Import Error:', error);
        res.status(500).json({ error: 'Failed to import contacts' });
    }
};

// Export Contacts
exports.exportContacts = async (req, res) => {
    try {
        const { tag, format = 'json' } = req.query;

        const query = { tenant: req.user.tenant };
        if (tag) {
            query.tags = tag;
        }

        const contacts = await Contact.find(query).select('-tenant -__v').lean();

        if (format === 'csv') {
            // Generate CSV
            const fields = ['name', 'phone', 'email', 'tags'];
            let csv = fields.join(',') + '\n';
            
            contacts.forEach(contact => {
                csv += `"${contact.name || ''}","${contact.phone}","${contact.email || ''}","${(contact.tags || []).join(';')}"\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
            return res.send(csv);
        }

        res.json({
            success: true,
            data: contacts
        });
    } catch (error) {
        console.error('Export Error:', error);
        res.status(500).json({ error: 'Failed to export contacts' });
    }
};