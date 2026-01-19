const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { protect, apiKeyAuth } = require('../middlewares/auth');

// Authentication middleware
const authenticate = (req, res, next) => {
    if (req.headers['x-api-key']) {
        return apiKeyAuth(req, res, next);
    }
    return protect(req, res, next);
};

// Routes
router.get('/', authenticate, contactController.getContacts);
router.get('/tags', authenticate, contactController.getAllTags);
router.get('/export', authenticate, contactController.exportContacts);
router.get('/:id', authenticate, contactController.getContact);
router.post('/', authenticate, contactController.createContact);
router.post('/import', authenticate, contactController.importContacts);
router.put('/:id', authenticate, contactController.updateContact);
router.delete('/:id', authenticate, contactController.deleteContact);
router.post('/:id/tags', authenticate, contactController.addTags);
router.delete('/:id/tags', authenticate, contactController.removeTags);

module.exports = router;