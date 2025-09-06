// Optional ANN for CLIP using hnswlib-node
const path = require("node:path");
const db = require("../config/database");
const { MODEL_ID, cosineSimilarity } = require("./clipService");

let available = false;
let hnsw = null; // instance of HierarchicalNSW
let HNSWClass = null; // constructor reference
let indexBuilt = false;
let dim = 0;

function tryLoadHNSW() {
    // Allow users to point to an existing installation (e.g., from another project)
    // HNSWLIB_NODE_PATH: full path to the module (folder containing package.json)
    // HNSWLIB_NODE_DIR: a directory to search using Node's resolver
    const explicitPath = process.env.HNSWLIB_NODE_PATH;
    const hintDir = process.env.HNSWLIB_NODE_DIR;
    const candidates = [];

    if (explicitPath) {
        candidates.push(explicitPath);
    }
    // Default resolution in current project
    candidates.push("hnswlib-node");

    if (hintDir) {
        try {
            const resolved = require.resolve("hnswlib-node", { paths: [hintDir] });
            candidates.unshift(resolved);
        } catch (_) {
            /* ignore */
        }
    }

    for (const c of candidates) {
        try {
            // If c is a path to file, require it directly; otherwise require as a package name
            const mod = require(c);
            return mod;
        } catch (_) {
            /* try next */
        }
    }
    return null;
}

(() => {
    try {
        const mod = tryLoadHNSW();
        if (!mod) {
            available = false;
            return;
        }
        // Module exports classes: { HierarchicalNSW, BruteforceSearch, ... }
        const ctor = mod?.HierarchicalNSW || (typeof mod === "function" ? mod : null);
        if (!ctor) {
            available = false;
            return;
        }
        HNSWClass = ctor;
        // Create a dummy instance to verify the binding works; will be rebuilt with real dim later
        hnsw = new HNSWClass("cosine", 1);
        available = true;
        indexBuilt = false;
    } catch (e) {
        available = false;
    }
})();

async function buildIndexIfNeeded() {
    if (!available || indexBuilt) return indexBuilt;
    const [rows] = await db.execute("SELECT image_id, dim, embedding FROM image_embeddings WHERE model = ?", [MODEL_ID]);
    if (rows.length === 0) return false;
    dim = rows[0].dim;
    // Recreate index with correct dim
    if (!HNSWClass) return false;
    hnsw = new HNSWClass("cosine", dim);
    hnsw.initIndex(rows.length);
    for (const r of rows) {
        const vec = JSON.parse(r.embedding);
        if (Array.isArray(vec) && vec.length === dim) {
            hnsw.addPoint(vec, r.image_id);
        }
    }
    indexBuilt = true;
    return true;
}

function invalidate() {
    indexBuilt = false;
}

async function annSearch(vector, topK = 20) {
    if (!available) return null;
    if (!indexBuilt) {
        const ok = await buildIndexIfNeeded();
        if (!ok) return null;
    }
    hnsw.setEf(Math.max(topK * 3, 100)); // higher ef leads to better accuracy, at the expense of speed
    const result = hnsw.searchKnn(vector, topK);
    // result: { neighbors: [ids], distances: [cosineDistance] }
    const ids = result.neighbors || [];
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await db.execute(
        `SELECT i.id as image_id, i.filename, i.original_name, i.title, i.description, e.embedding
        FROM images i JOIN image_embeddings e ON e.image_id = i.id
        WHERE e.model = ? AND i.id IN (${placeholders})`,
        [MODEL_ID, ...ids]
    );
    // Recompute cosine to improve accuracy ordering
    const scored = rows
        .map((r) => {
            const emb = JSON.parse(r.embedding);
            const sim = cosineSimilarity(vector, emb);
            return {
                imageId: r.image_id,
                url: `/uploads/images/${r.filename}`,
                filename: r.filename,
                original_name: r.original_name,
                title: r.title,
                description: r.description,
                similarity: Number(sim.toFixed(6)),
            };
        })
        .sort((a, b) => b.similarity - a.similarity);
    return scored;
}

module.exports = {
    isAvailable: () => available,
    buildIndexIfNeeded,
    invalidate,
    annSearch,
};
