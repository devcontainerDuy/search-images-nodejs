// Optional ANN for CLIP using hnswlib-node
const db = require('../config/database');
const { MODEL_ID, cosineSimilarity } = require('./clipService');

let available = false;
let hnsw = null;
let indexBuilt = false;
let dim = 0;

try {
  // Lazy require; if not installed, we’ll fallback
  // eslint-disable-next-line import/no-extraneous-dependencies
  const HNSWLib = require('hnswlib-node');
  hnsw = new HNSWLib('cosine', 1);
  available = true;
  indexBuilt = false;
} catch (e) {
  available = false;
}

async function buildIndexIfNeeded() {
  if (!available || indexBuilt) return indexBuilt;
  const [rows] = await db.execute(
    'SELECT image_id, dim, embedding FROM image_embeddings WHERE model = ?',
    [MODEL_ID]
  );
  if (rows.length === 0) return false;
  dim = rows[0].dim;
  // Recreate index with correct dim
  const HNSWLib = require('hnswlib-node');
  hnsw = new HNSWLib('cosine', dim);
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
  const result = hnsw.searchKnn(vector, topK);
  // result: { neighbors: [ids], distances: [cosineDistance] }
  const ids = result.neighbors || [];
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await db.execute(
    `SELECT i.id as image_id, i.filename, i.original_name, i.title, i.description, e.embedding
     FROM images i JOIN image_embeddings e ON e.image_id = i.id
     WHERE e.model = ? AND i.id IN (${placeholders})`,
    [MODEL_ID, ...ids]
  );
  // Recompute cosine to improve accuracy ordering
  const scored = rows.map(r => {
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
  }).sort((a, b) => b.similarity - a.similarity);
  return scored;
}

module.exports = {
  isAvailable: () => available,
  buildIndexIfNeeded,
  invalidate,
  annSearch,
};

