const express = require('express');
const uploadCtrl = require('../controllers/uploadController');
const searchCtrl = require('../controllers/searchController');

const router = express.Router();

// Text search
router.get('/api/search', searchCtrl.searchText);

// Upload
router.post('/api/upload', uploadCtrl.upload.single('image'), uploadCtrl.uploadImage);

// Get image
router.get('/api/image/:id', uploadCtrl.getImage);

// Delete image
router.delete('/api/image/:id', uploadCtrl.deleteImage);

// Reindex endpoints
router.post('/api/reindex-hashes', uploadCtrl.reindexHashes);
router.post('/api/reindex-embeddings', uploadCtrl.reindexEmbeddings);
router.post('/api/reindex-colors', uploadCtrl.reindexColors);

// Search by image (hash/clip)
router.post('/api/search-by-image', uploadCtrl.upload.single('image'), searchCtrl.searchByImage);

// Similar by existing id
router.get('/api/image/:id/similar', searchCtrl.similarById);

module.exports = router;

