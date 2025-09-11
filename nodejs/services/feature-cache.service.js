const LRU = require('lru-cache');
const path = require('path');
const fs = require('fs/promises');
const { computeFeatures, cosineSim } = require('../utils/visual-features');

// Cache extracted visual features per filename
const featureCache = new LRU({ max: parseInt(process.env.FEATURE_CACHE_MAX || '500', 10) });

async function getImageFeaturesByPath(absPath) {
  const key = absPath;
  const cached = featureCache.get(key);
  if (cached) return cached;
  const buf = await fs.readFile(absPath);
  const feats = await computeFeatures(buf);
  featureCache.set(key, feats);
  return feats;
}

async function getQueryFeatures(buffer) {
  // Query features aren't cached globally to avoid memory spikes; compute on demand
  return computeFeatures(buffer);
}

function colorSimilarity(a, b) { return cosineSim(a.color, b.color); }
function shapeSimilarity(a, b) {
  // Combine radial histogram similarity with ring presence
  const rh = cosineSim(a.radial, b.radial);
  const ringBoost = Math.min(a.ring, b.ring); // 0..1
  return Math.min(1, Math.max(0, rh * 0.85 + ringBoost * 0.15));
}

module.exports = {
  getImageFeaturesByPath,
  getQueryFeatures,
  colorSimilarity,
  shapeSimilarity,
};

