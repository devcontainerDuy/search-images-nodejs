#!/usr/bin/env node
// Reindex image perceptual hashes (and optionally CLIP embeddings)
// Usage:
//   node scripts/reindex.js --hashes   # reindex hashes (default)
//   node scripts/reindex.js --embeddings  # (optional) reindex embeddings if model available
//   node scripts/reindex.js --all  # both

require('dotenv').config();
const path = require('path');
const db = require('../config/database');
const { computeDHashHex, computeTileDHashes, computeOverlappingTileDHashes } = require('../utils/imageHash');
let clipUtils = null;

async function ensureSchemas() {
  await db.execute(`CREATE TABLE IF NOT EXISTS image_hashes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    image_id INT NOT NULL,
    tile_index INT NOT NULL,
    grid INT NOT NULL DEFAULT 4,
    hash CHAR(16) NOT NULL,
    stride INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (image_id),
    INDEX (tile_index),
    INDEX (hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  try { await db.execute('ALTER TABLE image_hashes ADD COLUMN stride INT NOT NULL DEFAULT 0'); } catch (e) {}

  await db.execute(`CREATE TABLE IF NOT EXISTS image_embeddings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    image_id INT NOT NULL,
    model VARCHAR(100) NOT NULL,
    dim INT NOT NULL,
    embedding MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (image_id),
    INDEX (model)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function reindexHashes(images) {
  let count = 0;
  for (const img of images) {
    try {
      await db.execute('DELETE FROM image_hashes WHERE image_id = ?', [img.id]);
      const globalHash = await computeDHashHex(img.file_path);
      await db.execute('INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)', [img.id, -1, 0, globalHash, 0]);
      const grids = [3, 4, 5];
      for (const g of grids) {
        const tiles = await computeTileDHashes(img.file_path, g);
        for (let i = 0; i < tiles.length; i++) {
          await db.execute('INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)', [img.id, i, g, tiles[i], 0]);
        }
      }
      const overlapHashes = await computeOverlappingTileDHashes(img.file_path, 4, 0.5);
      for (let i = 0; i < overlapHashes.length; i++) {
        await db.execute('INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)', [img.id, i, 4, overlapHashes[i], 50]);
      }
      count++;
      if (count % 10 === 0) console.log(`Reindexed hashes: ${count}/${images.length}`);
    } catch (e) {
      console.error('Hash reindex failed for image', img.id, e.message || e);
    }
  }
  return count;
}

async function reindexEmbeddings(images) {
  try {
    clipUtils = require('../utils/clip');
  } catch (e) {
    console.error('Embedding reindex requires @xenova/transformers. Skipping.');
    return 0;
  }
  let count = 0;
  for (const img of images) {
    try {
      const vec = await clipUtils.computeClipEmbedding(img.file_path);
      await db.execute('DELETE FROM image_embeddings WHERE image_id = ? AND model = ?', [img.id, clipUtils.MODEL_ID]);
      await db.execute('INSERT INTO image_embeddings (image_id, model, dim, embedding) VALUES (?, ?, ?, ?)', [img.id, clipUtils.MODEL_ID, vec.length, JSON.stringify(vec)]);
      count++;
      if (count % 10 === 0) console.log(`Reindexed embeddings: ${count}/${images.length}`);
    } catch (e) {
      console.error('Embedding reindex failed for image', img.id, e.message || e);
    }
  }
  return count;
}

async function main() {
  await ensureSchemas();
  const args = process.argv.slice(2);
  const doAll = args.includes('--all');
  const doHashes = doAll || args.includes('--hashes') || args.length === 0; // default to hashes
  const doEmbeddings = doAll || args.includes('--embeddings');

  const [images] = await db.execute('SELECT id, file_path FROM images');
  console.log(`Found ${images.length} images`);

  if (doHashes) {
    console.log('Reindexing hashes (global, 3x3, 4x4, 5x5, 4x4 overlap 50%)...');
    const n = await reindexHashes(images);
    console.log(`Done. Reindexed hashes for ${n} images.`);
  }

  if (doEmbeddings) {
    console.log('Reindexing embeddings (CLIP)...');
    const n = await reindexEmbeddings(images);
    console.log(`Done. Reindexed embeddings for ${n} images.`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('Reindex script error:', e);
  process.exit(1);
});

