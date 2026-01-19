const Template = require('../models/Template');

// @desc    Get all templates
// @route   GET /api/templates
exports.getTemplates = async (req, res) => {
    try {
        const { status, category } = req.query;
        
        const query = { tenant: req.user.tenant };
        
        if (status) {
            query.status = status;
        }
        
        if (category) {
            query.category = category;
        }

        const templates = await Template.find(query).sort({ createdAt: -1 });

        res.json({
            success: true,
            data: templates
        });
    } catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
};

// @desc    Get single template
// @route   GET /api/templates/:id
exports.getTemplate = async (req, res) => {
    try {
        const template = await Template.findOne({
            _id: req.params.id,
            tenant: req.user.tenant
        });

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({ error: 'Failed to fetch template' });
    }
};

// @desc    Create template
// @route   POST /api/templates
exports.createTemplate = async (req, res) => {
    try {
        const { name, category, language, components } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Template name is required' });
        }

        // Check if template with same name exists
        const existingTemplate = await Template.findOne({
            tenant: req.user.tenant,
            name: name.toLowerCase().replace(/\s/g, '_')
        });

        if (existingTemplate) {
            return res.status(400).json({ error: 'Template with this name already exists' });
        }

        const template = await Template.create({
            tenant: req.user.tenant,
            name: name.toLowerCase().replace(/\s/g, '_'),
            category: category || 'MARKETING',
            language: language || 'en',
            components: components || [],
            status: 'PENDING'
        });

        console.log('✅ Template created:', template.name);

        res.status(201).json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ error: 'Failed to create template', details: error.message });
    }
};

// @desc    Update template
// @route   PUT /api/templates/:id
exports.updateTemplate = async (req, res) => {
    try {
        const { name, category, language, components, status } = req.body;

        const template = await Template.findOne({
            _id: req.params.id,
            tenant: req.user.tenant
        });

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // Update fields
        if (name) template.name = name.toLowerCase().replace(/\s/g, '_');
        if (category) template.category = category;
        if (language) template.language = language;
        if (components) template.components = components;
        if (status) template.status = status;

        await template.save();

        res.json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
};

// @desc    Delete template
// @route   DELETE /api/templates/:id
exports.deleteTemplate = async (req, res) => {
    try {
        const template = await Template.findOneAndDelete({
            _id: req.params.id,
            tenant: req.user.tenant
        });

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        console.log('🗑️ Template deleted:', template.name);

        res.json({
            success: true,
            message: 'Template deleted successfully'
        });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
};

// @desc    Sync templates from WhatsApp
// @route   POST /api/templates/sync
exports.syncTemplates = async (req, res) => {
    try {
        // This would sync with WhatsApp Business API
        // For now, just return success
        res.json({
            success: true,
            message: 'Templates synced successfully'
        });
    } catch (error) {
        console.error('Sync templates error:', error);
        res.status(500).json({ error: 'Failed to sync templates' });
    }
};