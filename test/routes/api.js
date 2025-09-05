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

// Debug helpers to verify middleware execution order
function logPreSearch(req, res, next) {
  console.log('[api] /search-by-image hit (pre-multer)');
  next();
}
function logPostSearch(req, res, next) {
  console.log('[api] /search-by-image after-multer', {
    hasFile: !!req.file,
    hasBuffer: !!(req.file && req.file.buffer),
    hasPath: !!(req.file && req.file.path),
  });
  next();
}

// Search by image (hash/clip)
router.post('/search-by-image', logPreSearch, uploadCtrl.uploadSearch.single('image'), logPostSearch, searchCtrl.searchByImage);

// Similar by existing id
router.get('/image/:id/similar', searchCtrl.similarById);

module.exports = router;
