const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const { protect } = require('../middleware/authMiddleware');

// Debug log
console.log('Template Controller exports:', Object.keys(templateController));

// Template routes
router.get('/', protect, templateController.getTemplates);
router.get('/:id', protect, templateController.getTemplate);
router.post('/', protect, templateController.createTemplate);
router.put('/:id', protect, templateController.updateTemplate);
router.delete('/:id', protect, templateController.deleteTemplate);
router.post('/sync', protect, templateController.syncTemplates);

module.exports = router;