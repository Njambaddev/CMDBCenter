const express = require('express');
const { requireAuth, requireRole, requireWriteAccess } = require('../middleware/auth');
const cmdbController = require('../controllers/cmdbController');
const relationshipController = require('../controllers/relationshipController');

const router = express.Router();

router.use(requireAuth);

// Schemas & Dynamic Form Metadata + Znuny CMDB Class Creation & Sync
router.get('/schemas', cmdbController.getSchemas);
router.post('/classes/preview-yaml', cmdbController.previewClassYaml);
router.post('/classes/sync', cmdbController.syncClasses);
router.post('/classes', requireWriteAccess, requireRole('admin', 'operator'), cmdbController.createClass);
router.put('/classes/:className', requireWriteAccess, requireRole('admin', 'operator'), cmdbController.updateClassSchema);

// Bulk CMDB Operations
router.post('/bulk/preview', cmdbController.bulkPreview);
router.post('/bulk/import', requireWriteAccess, cmdbController.bulkImport);
router.post('/bulk/update', requireWriteAccess, cmdbController.bulkUpdate);

// CI Relationships (mounted before /:id so /relationships is never matched as an ID)
router.get('/relationships/graph', relationshipController.getGraph);
router.get('/relationships', relationshipController.getGraph);
router.post('/relationships', requireWriteAccess, relationshipController.createLink);
router.delete('/relationships/:id', requireWriteAccess, relationshipController.removeLink);

// Core CMDB Inventory CRUD
router.get('/', cmdbController.listInventory);
router.post('/', requireWriteAccess, cmdbController.createConfigItem);
router.get('/:id/relationships', relationshipController.getForCI);
router.get('/:id', cmdbController.getCIDetail);
router.patch('/:id', requireWriteAccess, cmdbController.updateConfigItem);
router.delete('/:id', requireWriteAccess, requireRole('admin'), cmdbController.deleteConfigItem);

module.exports = router;
