const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const multer = require("multer");
const { getModelId, embedImageFromBufferWithAugment } = require("../services/clip.service");
const { getEmbeddingsWithImages, getMissingImageIdsForModel, upsertEmbedding } = require("../models/embeddings");
const { cosine } = require("../utils/clip");
const { LRUCache } = require("lru-cache");
const { sha256 } = require("../utils/helper");

let augmentationEnabled = true; // runtime toggle, applied in embedding

// In-memory cache of embeddings per model to avoid re-reading/parsing on every search
const cache = new Map(); // key: modelId, val: { items: [{ image_id, filename, title, vec }], dim }

// LRU cache for query image embeddings (mirror Python @lru_cache)
const queryCache = new LRUCache({ max: 200, ttl: 5 * 60 * 1000 });

async function getQueryEmbedding(buffer, useAug, modelId) {
    const key = `${modelId}:${useAug ? "aug" : "raw"}:${sha256(buffer)}`;
    const cached = queryCache.get(key);
    if (cached) return { vec: cached, cached: true };
    const vec = await embedImageFromBufferWithAugment(buffer, useAug);
    queryCache.set(key, vec);
    return { vec, cached: false };
}

async function warmCache(modelId) {
    const rows = await getEmbeddingsWithImages(modelId);
    const items = [];
    let dim = 0;
    for (const r of rows) {
        try {
            const arr = JSON.parse(r.embedding);
            const vec = Float32Array.from(arr);
            if (!dim) dim = vec.length;
            items.push({ image_id: r.image_id, filename: r.filename, title: r.title, description: r.description, tags: r.tags, vec });
        } catch (_) {}
    }
    cache.set(modelId, { items, dim });
}

async function ensureCache(modelId) {
    if (!cache.has(modelId)) await warmCache(modelId);
    return cache.get(modelId);
}

// Memory storage for search upload (do not persist query image)
const memoryUpload = multer({ storage: multer.memoryStorage() });

const uploadSearch = memoryUpload.single("image");

async function searchByImage(req, res) {
    const t0 = Date.now();
    try {
        // Expect memory file from multer
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ error: "No image uploaded" });
        }

        const min_similarity = Math.max(0, Math.min(1, parseFloat(req.body.min_similarity ?? "0.65")));
        const top_k = Math.max(1, Math.min(200, parseInt(req.body.top_k ?? "50", 10)));
        const category = (req.body.category || "").toString().trim().toLowerCase();
        const use_augmentation = String(req.body.use_augmentation ?? "true").toLowerCase() === "true";
        augmentationEnabled = use_augmentation;

        const modelId = getModelId();

        const tFeat0 = Date.now();
        const { vec: qvec } = await getQueryEmbedding(req.file.buffer, use_augmentation, modelId); // L2-normalized
        const feature_time = (Date.now() - tFeat0) / 1000;

        const { items } = await ensureCache(modelId);

        const tSim0 = Date.now();
        const scored = [];
        for (const it of items) {
            // Ensure same dimension
            if (it.vec && it.vec.length === qvec.length) {
                const score = cosine(qvec, it.vec);
                if (score >= min_similarity) {
                    if (category) {
                        const tags = (it.tags || "").toString().toLowerCase();
                        const title = (it.title || "").toString().toLowerCase();
                        const desc = (it.description || "").toString().toLowerCase();
                        const match = tags.split(/[\s,;]+/).includes(category) || title.includes(category) || desc.includes(category);
                        if (!match) continue;
                    }
                    scored.push({
                        image: it.filename,
                        score,
                        image_url: `/uploads/images/${it.filename}`,
                        metadata: { title: it.title, description: it.description, tags: it.tags },
                    });
                }
            }
        }
        const tSort0 = Date.now();
        scored.sort((a, b) => b.score - a.score);
        const results = scored.slice(0, top_k).map((r) => ({ ...r, score: Number(r.score.toFixed(6)) }));
        const similarity_time = (tSort0 - tSim0) / 1000;
        const sorting_time = (Date.now() - tSort0) / 1000;

        const total_time = (Date.now() - t0) / 1000;
        return res.json({
            total_results: results.length,
            min_similarity,
            results,
            timing: {
                feature_extraction: feature_time,
                similarity_calculation: similarity_time,
                sorting: sorting_time,
                total: total_time,
            },
            use_augmentation: augmentationEnabled,
            model: modelId,
        });
    } catch (err) {
        console.error("searchByImage failed:", err);
        return res.status(500).json({ error: "Search failed", detail: String(err.message || err) });
    }
}

async function rebuildEmbeddings(req, res) {
    try {
        const modelId = getModelId();
        const missing = await getMissingImageIdsForModel(modelId);
        let processed = 0;
        for (const row of missing) {
            const abs = path.join(__dirname, "..", row.file_path);
            try {
                // Embed with same augmentation strategy as search for better robustness
                const buf = await fs.readFile(abs);
                const vec = await embedImageFromBufferWithAugment(buf, augmentationEnabled);
                await upsertEmbedding(row.id, modelId, vec);
                processed++;
            } catch (e) {
                console.warn("Skip embedding", row.id, row.filename, e.message || e);
            }
        }
        // Refresh cache after rebuild
        cache.delete(modelId);
        await ensureCache(modelId);
        return res.json({ status: "success", processed, model: modelId });
    } catch (err) {
        console.error("rebuildEmbeddings failed:", err);
        return res.status(500).json({ error: "Rebuild failed", detail: String(err.message || err) });
    }
}

async function stats(req, res) {
    try {
        const modelId = getModelId();
        const entry = await ensureCache(modelId);
        return res.json({
            total_images: entry.items.length,
            device: "wasm-cpu",
            model: modelId,
            image_folder: "/uploads/images",
            augmentation_enabled: augmentationEnabled,
        });
    } catch (err) {
        return res.status(500).json({ error: "Stats failed", detail: String(err.message || err) });
    }
}

async function toggleAugmentation(req, res) {
    try {
        const enabled = !!req.body?.enabled;
        augmentationEnabled = enabled;
        return res.json({ status: "success", augmentation_enabled: augmentationEnabled });
    } catch (err) {
        return res.status(400).json({ error: "Invalid request" });
    }
}

module.exports = {
    uploadSearch,
    searchByImage,
    rebuildEmbeddings,
    stats,
    toggleAugmentation,
};
