const { LRUCache } = require("lru-cache");
const { sha256 } = require("../utils/helper");
const { getEmbeddingsWithImages } = require("../models/embeddings");
const { embedImageFromBufferWithAugment } = require("./clip.service");
const { getRegionsByModel } = require("../models/region_embeddings");

// Configurable via env
const MODEL_CACHE_MAX = parseInt(process.env.MODEL_CACHE_MAX || "3", 10);
const QUERY_CACHE_MAX = parseInt(process.env.QUERY_CACHE_MAX || "200", 10);
const QUERY_CACHE_TTL = parseInt(process.env.QUERY_CACHE_TTL_MS || String(5 * 60 * 1000), 10);

// Cache of embeddings per model
// value: { items: [{ image_id, filename, title, description, tags, vec }], dim }
const modelCache = new LRUCache({ max: MODEL_CACHE_MAX });
// Region tiles cache per model (optional)
const regionModelCache = new LRUCache({ max: MODEL_CACHE_MAX });

// Cache of query image embeddings (per model + augmentation setting)
const queryCache = new LRUCache({ max: QUERY_CACHE_MAX, ttl: QUERY_CACHE_TTL });

async function warmModelCache(modelId) {
    const rows = await getEmbeddingsWithImages(modelId);
    const items = [];
    let dim = 0;
    for (const r of rows) {
        try {
            const arr = JSON.parse(r.embedding);
            const vec = Float32Array.from(arr);
            if (!dim) dim = vec.length;
            items.push({ image_id: r.image_id, filename: r.filename, title: r.title, description: r.description, tags: r.tags, width: r.width, height: r.height, vec });
        } catch (_) {}
    }
    const entry = { items, dim };
    modelCache.set(modelId, entry);
    return entry;
}

async function ensureModelCache(modelId) {
    if (!modelCache.has(modelId)) {
        return warmModelCache(modelId);
    }
    return modelCache.get(modelId);
}

function deleteModelCache(modelId) {
    modelCache.delete(modelId);
    regionModelCache.delete(modelId);
}

function clearModelCache() {
    modelCache.clear();
    regionModelCache.clear();
}

function clearQueryCache() {
    queryCache.clear();
}

function clearAllCaches() {
    clearQueryCache();
    clearModelCache();
}

function getCacheStats() {
    return {
        query_cache_size: queryCache.size,
        query_cache_max: queryCache.max,
        embedding_models_cached: modelCache.size,
        model_cache_max: modelCache.max,
        region_models_cached: regionModelCache.size,
    };
}

async function getQueryEmbedding(buffer, useAug, modelId, analysis = null) {
    const key = `${modelId}:${useAug ? "aug" : "raw"}:${sha256(buffer)}`;
    const cached = queryCache.get(key);
    if (cached) {
        return { vec: cached, cached: true };
    }
    const vec = await embedImageFromBufferWithAugment(buffer, useAug, true, analysis);
    queryCache.set(key, vec);
    return { vec, cached: false };
}

module.exports = {
    // model cache
    warmModelCache,
    ensureModelCache,
    deleteModelCache,
    clearModelCache,
    // region cache
    warmRegionCache: async function warmRegionCache(modelId) {
        const rows = await getRegionsByModel(modelId);
        const items = [];
        let dim = 0;
        for (const r of rows) {
            try {
                const arr = JSON.parse(r.embedding);
                const vec = Float32Array.from(arr);
                if (!dim) dim = vec.length;
                items.push({ image_id: r.image_id, rect: { x: r.x, y: r.y, w: r.w, h: r.h }, vec });
            } catch (_) {}
        }
        const entry = { items, dim };
        regionModelCache.set(modelId, entry);
        return entry;
    },
    ensureRegionCache: async function ensureRegionCache(modelId) {
        if (!regionModelCache.has(modelId)) {
            return this.warmRegionCache(modelId);
        }
        return regionModelCache.get(modelId);
    },
    // query cache
    getQueryEmbedding,
    clearQueryCache,
    // both
    clearAllCaches,
    getCacheStats,
    _regionModelCache: regionModelCache,
};
