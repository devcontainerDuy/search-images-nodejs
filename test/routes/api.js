const express = require('express');
const uploadCtrl = require('../controllers/uploadController');
const searchCtrl = require('../controllers/searchController');

const router = express.Router();

// Text search
router.get('/search', searchCtrl.searchText);

// Upload
router.post('/upload', uploadCtrl.upload.single('image'), uploadCtrl.uploadImage);

// Get image
router.get('/image/:id', uploadCtrl.getImage);

// Delete image
router.delete('/image/:id', uploadCtrl.deleteImage);

// Reindex endpoints
router.post('/reindex-hashes', uploadCtrl.reindexHashes);
router.post('/reindex-embeddings', uploadCtrl.reindexEmbeddings);
router.post('/reindex-colors', uploadCtrl.reindexColors);

// Search by image (hash/clip)
router.post('/search-by-image', uploadCtrl.upload.single('image'), searchCtrl.searchByImage);

// Similar by existing id
router.get('/image/:id/similar', searchCtrl.similarById);

module.exports = router;

