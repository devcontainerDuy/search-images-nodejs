const path = require("path");
const fs = require("fs/promises");
const multer = require("multer");
const { getModelId, embedImageFromBufferWithAugment, getModelInfo, processBatchEmbeddings, embedImageGridTiles } = require("../services/clip.service");
const { analyzeImageQuality } = require("../utils/smart-augment");
const { getEmbeddingsWithImages, getMissingImageIdsForModel, upsertEmbedding } = require("../models/embeddings");
const { cosine } = require("../utils/clip");
const { warmModelCache, ensureModelCache, deleteModelCache, getQueryEmbedding, clearQueryCache, clearAllCaches, getCacheStats, ensureRegionCache } = require("../services/cache.service");
const { getAugmentationEnabled, setAugmentationEnabled, getRobustRecoveryMode, setRobustRecoveryMode } = require("../services/settings.service");

// Global augmentation lives in settings.service
let globalStats = {
    totalSearches: 0,
    totalRebuildOperations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    lastRebuildTime: null,
    avgSearchTime: 0,
};

// caching helpers are provided by services/cache.service

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

        let min_similarity = Math.max(0, Math.min(1, parseFloat(req.body.min_similarity ?? "0.65")));
        let top_k = Math.max(1, Math.min(200, parseInt(req.body.top_k ?? "50", 10)));
        const category = (req.body.category || "").toString().trim().toLowerCase();
        // Support 'auto' mode for augmentation (default: auto)
        const augParam = String(req.body.use_augmentation ?? "auto").toLowerCase();
        let augmentationMode = augParam === "true" ? true : augParam === "false" ? false : "auto";
        const enableRerankRaw = String(req.body.enable_rerank ?? "true").toLowerCase();
        let enable_rerank = ["true", "1", "yes", "on"].includes(enableRerankRaw);
        let rerank_k = Math.max(1, Math.min(50, parseInt(req.body.rerank_k ?? "10", 10)));
        // Decide final augmentation for this request, respecting global switch first
        const globalAug = getAugmentationEnabled();
        let useAugmentation = globalAug;

        // Log search parameters (mirror Python logging)
        console.log(`🔍 Search request: min_sim=${min_similarity}, top_k=${top_k}, augmentation=${augmentationMode}, global=${globalAug}`);
        globalStats.totalSearches++;

        const modelId = getModelId();

        // Analyze query image quality to adapt search tolerance and augmentation strategy
        try {
            const analysis = await analyzeImageQuality(req.file.buffer);
            if (analysis) {
                const adjustments = [];
                if (analysis.isBlurry || analysis.isNoisy || analysis.isLowContrast) {
                    const old = min_similarity;
                    min_similarity = Math.max(0, min_similarity - 0.05);
                    adjustments.push(`min_similarity ${old.toFixed(2)}→${min_similarity.toFixed(2)}`);
                }
                if (analysis.isBlurry || analysis.isDark || analysis.isBright) {
                    const oldTop = top_k;
                    top_k = Math.min(200, Math.max(top_k, 50));
                    if (oldTop !== top_k) adjustments.push(`top_k ${oldTop}→${top_k}`);
                }
                // Decide augmentation with precedence: global -> per-request
                if (globalAug) {
                    if (augmentationMode === "auto") {
                        const severe = analysis.isBlurry || analysis.isNoisy;
                        const moderate = analysis.isLowContrast || analysis.isDark || analysis.isBright;
                        useAugmentation = severe || moderate;
                        if (!severe) rerank_k = Math.min(rerank_k, 3);
                        adjustments.push(`augmentation ${useAugmentation ? 'on' : 'off'} (auto)`);
                    } else {
                        useAugmentation = augmentationMode === true;
                    }
                } else {
                    useAugmentation = false;
                    adjustments.push('augmentation off (global)');
                }
                if (adjustments.length) {
                    console.log(`🎛️ Adaptive search params due to quality: ${adjustments.join(", ")}`);
                }
                console.log(`🎚 Final augmentation: ${useAugmentation} (mode=${augmentationMode}, global=${globalAug})`);
            }
        } catch (_) {}

        const tFeat0 = Date.now();
        const { vec: qvec, cached } = await getQueryEmbedding(req.file.buffer, useAugmentation, modelId); // L2-normalized
        if (cached) globalStats.cacheHits++;
        else globalStats.cacheMisses++;
        const feature_time = (Date.now() - tFeat0) / 1000;
        console.log(`⚡ Feature extraction time: ${feature_time.toFixed(4)}s${cached ? " (cached)" : ""}`);

        const { items } = await ensureModelCache(modelId);

        const tSim0 = Date.now();
        const scored = [];
        for (const it of items) {
            // Ensure same dimension
            if (!it.vec || it.vec.length !== qvec.length) continue;
            // Early category filter to avoid unnecessary cosine
            if (category) {
                const tags = (it.tags || "").toString().toLowerCase();
                const title = (it.title || "").toString().toLowerCase();
                const desc = (it.description || "").toString().toLowerCase();
                const match = tags.split(/[\s,;]+/).includes(category) || title.includes(category) || desc.includes(category);
                if (!match) continue;
            }
            const score = cosine(qvec, it.vec);
            if (score >= min_similarity) {
                scored.push({
                    image: it.filename,
                    score,
                    image_url: `/uploads/images/${it.filename}`,
                    metadata: {
                        title: it.title,
                        description: it.description,
                        tags: it.tags,
                        image_id: it.image_id,
                        width: it.width,
                        height: it.height,
                    },
                });
            }
        }
        const tSort0 = Date.now();
        scored.sort((a, b) => b.score - a.score);
        let results = scored.slice(0, top_k).map((r) => ({ ...r, score: Number(r.score.toFixed(6)) }));
        const similarity_time = (tSort0 - tSim0) / 1000;
        const sorting_time = (Date.now() - tSort0) / 1000;

        // Optional reranking on top-K using robust augmented embeddings
        let rerank_time = 0;
        let reranked = false;
        if (enable_rerank && results.length > 1) {
            const tR0 = Date.now();
            const n = Math.min(rerank_k, results.length);
            try {
                const updated = await Promise.all(results.slice(0, n).map(async (r) => {
                    try {
                        const abs = path.join(__dirname, '..', 'public', 'uploads', 'images', r.image);
                        const buf = await fs.readFile(abs);
                        // Robust mode: try grid tiles max similarity to handle tiny crops/occlusions
                        let best = -1;
                        if (getRobustRecoveryMode()) {
                            // Prefer precomputed region vectors if available
                            try {
                                const regionEntry = await ensureRegionCache(modelId);
                                const regions = regionEntry?.items?.filter(it => it.image_id === r.metadata.image_id) || [];
                                if (regions.length) {
                                    for (const rr of regions) {
                                        const s = cosine(qvec, rr.vec);
                                        if (s > best) { best = s; bestRect = rr.rect; }
                                    }
                                } else {
                                    // Fallback to on-the-fly tile embeddings with overlap
                                    const grid = Math.max(2, parseInt(process.env.ROBUST_GRID || '7', 10));
                                    const overlap = Math.max(0, Math.min(0.9, parseFloat(process.env.ROBUST_OVERLAP || '0.5')));
                                    const tiles = await embedImageGridTiles(buf, grid, overlap);
                                    for (const t of tiles) {
                                        const s = cosine(qvec, t.vec);
                                        if (s > best) { best = s; bestRect = t.rect; }
                                    }
                                }
                            } catch (_) {}
                        }
                        // Fallback or complement: full-image with (optional) augment
                        if (best < 0) {
                            const vec = await embedImageFromBufferWithAugment(buf, useAugmentation, true);
                            best = cosine(qvec, vec);
                        }
                        const out = { ...r, score_rerank: Number(best.toFixed(6)) };
                        if (bestRect && r.metadata?.width && r.metadata?.height) {
                            out.region_match = {
                                x: bestRect.x,
                                y: bestRect.y,
                                w: bestRect.w,
                                h: bestRect.h,
                                w_img: r.metadata.width,
                                h_img: r.metadata.height,
                            };
                        }
                        return out;
                    } catch (_) {
                        return r;
                    }
                }));
                // Merge updated reranked with the rest and sort by score_rerank if present
                const merged = [...updated, ...results.slice(n)];
                merged.sort((a, b) => (b.score_rerank ?? b.score) - (a.score_rerank ?? a.score));
                results = merged;
                reranked = true;
            } catch (_) { /* ignore rerank errors */ }
            rerank_time = (Date.now() - tR0) / 1000;
        }

        const total_time = (Date.now() - t0) / 1000;

        // Update global stats
        globalStats.avgSearchTime = (globalStats.avgSearchTime * (globalStats.totalSearches - 1) + total_time) / globalStats.totalSearches;

        console.log(`✅ Search completed: ${results.length} results in ${total_time.toFixed(4)}s`);

        return res.json({
            total_results: results.length,
            min_similarity,
            results,
            timing: {
                feature_extraction: feature_time,
                similarity_calculation: similarity_time,
                sorting: sorting_time,
                rerank: rerank_time,
                total: total_time,
            },
            use_augmentation: useAugmentation,
            augmentation_global: globalAug,
            reranked,
            model: modelId,
            cache_stats: {
                cache_hit: cached,
                total_cached_embeddings: items.length,
            },
        });
    } catch (err) {
        console.error("❌ searchByImage failed:", err);
        return res.status(500).json({ error: "Search failed", detail: String(err.message || err) });
    }
}

async function rebuildEmbeddings(req, res) {
    const startTime = Date.now();
    try {
        console.log("🔄 Starting embeddings rebuild...");
        globalStats.totalRebuildOperations++;

        const modelId = getModelId();
        const missing = await getMissingImageIdsForModel(modelId);

        if (missing.length === 0) {
            console.log("✅ No missing embeddings found");
            return res.json({
                status: "success",
                processed: 0,
                message: "No missing embeddings",
                model: modelId,
            });
        }

        console.log(`🔄 Found ${missing.length} images without embeddings`);

        // Process in batches to avoid memory issues
        const batchSize = 20;
        let totalProcessed = 0;
        let totalErrors = 0;

        for (let i = 0; i < missing.length; i += batchSize) {
            const batch = missing.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(missing.length / batchSize)}`);

            // Prepare batch data
            const batchData = [];
            for (const row of batch) {
                const abs = path.join(__dirname, "..", row.file_path);
                try {
                    const buf = await fs.readFile(abs);
                    batchData.push({ id: row.id, buffer: buf, filename: row.filename });
                } catch (e) {
                    console.warn(`❌ Cannot read file ${row.filename}:`, e.message);
                    totalErrors++;
                }
            }

            // Process batch embeddings
            if (batchData.length > 0) {
                const results = await processBatchEmbeddings(batchData, getAugmentationEnabled());

                // Save to database
                for (const result of results) {
                    if (result.embedding) {
                        try {
                            await upsertEmbedding(result.id, modelId, result.embedding);
                            totalProcessed++;
                        } catch (e) {
                            console.warn(`❌ Failed to save embedding for ID ${result.id}:`, e.message);
                            totalErrors++;
                        }
                    } else if (result.error) {
                        totalErrors++;
                    }
                }
            }
        }

        // Refresh cache after rebuild
        console.log("🔄 Refreshing cache...");
        deleteModelCache(modelId);
        await ensureModelCache(modelId);

        const totalTime = (Date.now() - startTime) / 1000;
        globalStats.lastRebuildTime = new Date().toISOString();

        console.log(`✅ Rebuild completed: ${totalProcessed} processed, ${totalErrors} errors in ${totalTime.toFixed(2)}s`);

        return res.json({
            status: "success",
            processed: totalProcessed,
            errors: totalErrors,
            total_time: totalTime,
            model: modelId,
            message: `Processed ${totalProcessed} images in ${totalTime.toFixed(2)}s`,
        });
    } catch (err) {
        console.error("❌ rebuildEmbeddings failed:", err);
        return res.status(500).json({ error: "Rebuild failed", detail: String(err.message || err) });
    }
}

// Build region (tile) embeddings for all images for current model
async function rebuildRegionEmbeddings(req, res) {
    const startTime = Date.now();
    try {
        console.log("🔄 Starting region embeddings rebuild...");
        const modelId = getModelId();
        // Ensure base embeddings exist to get file list with paths
        const { getEmbeddingsWithImages } = require("../models/embeddings");
        const { ensureRegionTable, upsertRegionEmbedding, deleteRegionsForModel } = require("../models/region_embeddings");
        await ensureRegionTable();

        const rows = await getEmbeddingsWithImages(modelId);
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.json({ status: 'success', processed: 0, message: 'No base embeddings found for current model' });
        }

        // Optional: clear existing regions for model to avoid duplicates
        await deleteRegionsForModel(modelId);

        const batchSize = 10;
        let processed = 0;
        let errors = 0;
        const grid = Math.max(2, parseInt(process.env.ROBUST_GRID || '7', 10));
        const overlap = Math.max(0, Math.min(0.9, parseFloat(process.env.ROBUST_OVERLAP || '0.5')));
        const { embedImageFromImageData } = require("../services/clip.service");
        const { generateGridTiles } = require("../utils/augment");
        const fs = require('fs/promises');

        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            console.log(`Processing regions batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(rows.length / batchSize)}`);
            for (const row of batch) {
                try {
                    const abs = path.join(__dirname, '..', 'public', 'uploads', 'images', row.filename);
                    const buf = await fs.readFile(abs);
                    const tiles = await generateGridTiles(buf, { grid, overlap, maxTiles: grid * grid * 2 });
                    for (const t of tiles) {
                        try {
                            const v = await embedImageFromImageData(t);
                            const rect = t.rect || { x: 0, y: 0, w: t.width, h: t.height };
                            await upsertRegionEmbedding(row.image_id, modelId, rect, v);
                        } catch (_) {}
                    }
                    processed++;
                } catch (e) {
                    errors++;
                }
            }
        }

        // Refresh region cache
        const { warmRegionCache } = require("../services/cache.service");
        await warmRegionCache(modelId);

        const totalTime = (Date.now() - startTime) / 1000;
        return res.json({ status: 'success', processed, errors, total_time: totalTime });
    } catch (err) {
        console.error("❌ rebuildRegionEmbeddings failed:", err);
        return res.status(500).json({ error: "Rebuild region embeddings failed", detail: String(err.message || err) });
    }
}

async function stats(req, res) {
    try {
        const modelId = getModelId();
        const entry = await ensureModelCache(modelId);
        const regionEntry = await (async () => { try { return await ensureRegionCache(modelId); } catch { return { items: [], dim: 0 }; }})();
        const modelInfo = getModelInfo();

        // Calculate cache efficiency
        const totalCacheOps = globalStats.cacheHits + globalStats.cacheMisses;
        const cacheHitRate = totalCacheOps > 0 ? ((globalStats.cacheHits / totalCacheOps) * 100).toFixed(2) : 0;

        const cacheStats = getCacheStats();
        return res.json({
            // Basic stats (matching Python format)
            total_images: entry.items.length,
            device: modelInfo.device,
            model: modelId,
            image_folder: "/uploads/images",
            augmentation_enabled: getAugmentationEnabled(),
            robust_recovery_mode: getRobustRecoveryMode(),

            // Enhanced stats (Node.js specific)
            model_info: modelInfo,
            performance_stats: {
                total_searches: globalStats.totalSearches,
                total_rebuild_operations: globalStats.totalRebuildOperations,
                average_search_time: globalStats.avgSearchTime.toFixed(4),
                last_rebuild_time: globalStats.lastRebuildTime,
            },
            cache_stats: {
                query_cache_size: cacheStats.query_cache_size,
                query_cache_max: cacheStats.query_cache_max,
                cache_hits: globalStats.cacheHits,
                cache_misses: globalStats.cacheMisses,
                cache_hit_rate: `${cacheHitRate}%`,
                embedding_models_cached: cacheStats.embedding_models_cached,
                embedding_cache_size: entry.items.length,
                embedding_dimension: entry.dim || 0,
                region_models_cached: cacheStats.region_models_cached,
                region_embeddings_cached: regionEntry.items.length,
                region_embedding_dimension: regionEntry.dim || 0,
            },
            system_info: {
                node_version: process.version,
                memory_usage: process.memoryUsage(),
                uptime: process.uptime(),
            },
        });
    } catch (err) {
        console.error("❌ stats failed:", err);
        return res.status(500).json({ error: "Stats failed", detail: String(err.message || err) });
    }
}

async function toggleAugmentation(req, res) {
    try {
        const enabled = !!req.body?.enabled;
        const previousState = getAugmentationEnabled();
        setAugmentationEnabled(enabled);

        const statusText = enabled ? "enabled" : "disabled";
        const actionText = enabled ? "bật" : "tắt";

        console.log(`🔧 Augmentation ${statusText} (changed from ${previousState} to ${enabled})`);
        console.log(`Đã ${actionText} tính năng tăng cường dữ liệu`);

        // Clear query cache when augmentation setting changes to ensure consistency
        if (previousState !== enabled) {
            clearQueryCache();
            console.log("🗑️ Query cache cleared due to augmentation setting change");
        }

        return res.json({
            status: "success",
            augmentation_enabled: getAugmentationEnabled(),
            previous_state: previousState,
            cache_cleared: previousState !== enabled,
        });
    } catch (err) {
        console.error("❌ toggleAugmentation failed:", err);
        return res.status(400).json({ error: "Invalid request", detail: String(err.message || err) });
    }
}

async function toggleRobust(req, res) {
    try {
        const enabled = !!req.body?.enabled;
        const previous = getRobustRecoveryMode();
        setRobustRecoveryMode(enabled);
        console.log(`🔧 Robust recovery mode ${enabled ? 'enabled' : 'disabled'} (was ${previous})`);
        // Changing robustness does not require cache clear, but we could clear query cache to avoid surprises
        // clearQueryCache();
        return res.json({ status: 'success', robust_recovery_mode: getRobustRecoveryMode(), previous_state: previous });
    } catch (err) {
        console.error("❌ toggleRobust failed:", err);
        return res.status(400).json({ error: "Invalid request", detail: String(err.message || err) });
    }
}

// Additional utility functions to mirror Python functionality

/**
 * Clear all caches (useful for debugging)
 */
async function clearCaches(req, res) {
    try {
        const before = getCacheStats();
        clearAllCaches();

        console.log("🗑️ All caches cleared");

        return res.json({
            status: "success",
            message: "All caches cleared",
            cleared: {
                query_embeddings: before.query_cache_size,
                embedding_models: before.embedding_models_cached,
            },
        });
    } catch (err) {
        console.error("❌ clearCaches failed:", err);
        return res.status(500).json({ error: "Clear caches failed", detail: String(err.message || err) });
    }
}

/**
 * Health check endpoint
 */
async function healthCheck(req, res) {
    try {
        const modelId = getModelId();
        const modelInfo = getModelInfo();

        return res.json({
            status: "healthy",
            timestamp: new Date().toISOString(),
            model: modelId,
            model_loaded: modelInfo.loaded,
            augmentation_enabled: getAugmentationEnabled(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
        });
    } catch (err) {
        console.error("❌ healthCheck failed:", err);
        return res.status(500).json({
            status: "unhealthy",
            error: String(err.message || err),
            timestamp: new Date().toISOString(),
        });
    }
}

module.exports = {
    uploadSearch,
    searchByImage,
    rebuildEmbeddings,
    rebuildRegionEmbeddings,
    stats,
    toggleAugmentation,
    toggleRobust,
    clearCaches,
    healthCheck,
};
