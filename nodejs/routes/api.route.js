const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { index, create, deleted } = require("../controllers/api.controller.js");
const searchCtrl = require("../controllers/search.controller.js");

// Ensure upload directory exists
const uploadRoot = path.join(__dirname, "..", "public", "uploads", "images");
fs.mkdirSync(uploadRoot, { recursive: true });

// Multer storage config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadRoot);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, "_");
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
        cb(null, `${base}-${unique}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.test(ext)) {
            cb(null, true);
        } else {
            cb(new Error("Only images are allowed (jpeg, jpg, png, gif)"));
        }
    },
});

/**
 * CRD endpoints
 * GET /images - list all images
 * POST /images - upload images (field name: image)
 * DELETE /images/:id - delete image by id
 */
router.get("/images", index);
router.post("/images", upload.array("image", 50), create);
router.delete("/images/:id", deleted);

// Search by uploaded image (CLIP)
router.post("/search", searchCtrl.uploadSearch, searchCtrl.searchByImage);

// Rebuild embeddings for all images (missing for current model)
router.get("/rebuild-embeddings", searchCtrl.rebuildEmbeddings);
// Alias to mirror Python endpoint naming
router.get("/rebuild", searchCtrl.rebuildEmbeddings);

// Stats and augmentation toggle
router.get("/stats", searchCtrl.stats);
router.post("/toggle-augmentation", express.json(), searchCtrl.toggleAugmentation);
// Alias to mirror Python underscore naming
router.post("/toggle_augmentation", express.json(), searchCtrl.toggleAugmentation);

// Toggle robust recovery mode
router.post("/toggle-robust", express.json(), searchCtrl.toggleRobust);

// Additional utility endpoints
router.delete("/clear-caches", searchCtrl.clearCaches);
router.get("/health", searchCtrl.healthCheck);

module.exports = router;
