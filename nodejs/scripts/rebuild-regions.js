#!/usr/bin/env node
// Rebuild region (tile) embeddings for images missing regions, newest first
require('dotenv').config();
const path = require('path');
const fs = require('fs/promises');
const db = require('../config/database');
const { getModelId, embedImageFromImageData } = require('../services/clip.service');
const { getImagesMissingRegions, ensureRegionTable, upsertRegionEmbedding, deleteRegionsForModel } = require('../models/region_embeddings');
const { generateGridTiles } = require('../utils/augment');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: 0, order: 'DESC', clear: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--limit' && args[i+1]) { opts.limit = parseInt(args[++i], 10) || 0; }
    else if (a === '-n' && args[i+1]) { opts.limit = parseInt(args[++i], 10) || 0; }
    else if (a === '--order' && args[i+1]) { opts.order = (args[++i] || 'DESC').toUpperCase(); }
    else if (a === '--clear') { opts.clear = true; }
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node scripts/rebuild-regions.js [--limit N] [--order DESC|ASC] [--clear]');
      console.log('  --clear    Delete existing region embeddings for current model before building');
      process.exit(0);
    }
  }
  return opts;
}

(async () => {
  const t0 = Date.now();
  const { limit, order, clear } = parseArgs();
  const modelId = getModelId();
  const grid = Math.max(2, parseInt(process.env.ROBUST_GRID || '7', 10));
  const overlap = Math.max(0, Math.min(0.9, parseFloat(process.env.ROBUST_OVERLAP || '0.5')));

  console.log(`🔄 Rebuilding region embeddings (model=${modelId}, order=${order}, limit=${limit||'∞'}, grid=${grid}, overlap=${overlap})`);
  try {
    await ensureRegionTable();
    if (clear) {
      console.log('🗑️  Clearing existing region embeddings for this model...');
      await deleteRegionsForModel(modelId);
    }

    const rows = await getImagesMissingRegions(modelId, { order, limit });
    if (!rows.length) {
      console.log('✅ No images missing region embeddings. Nothing to do.');
      process.exit(0);
    }

    let processed = 0, errors = 0;
    for (const row of rows) {
      try {
        const abs = path.join(__dirname, '..', 'public', 'uploads', 'images', row.filename);
        const buf = await fs.readFile(abs);
        const tiles = await generateGridTiles(buf, { grid, overlap, maxTiles: grid * grid * 2 });
        for (const t of tiles) {
          try {
            const v = await embedImageFromImageData(t);
            const rect = t.rect || { x: 0, y: 0, w: t.width, h: t.height };
            await upsertRegionEmbedding(row.image_id, modelId, rect, v);
          } catch (_) { /* per-tile fail ignored */ }
        }
        processed++;
        if (processed % 10 === 0) {
          const dt = (Date.now() - t0) / 1000;
          console.log(`... ${processed}/${rows.length} images regionized (${(processed/dt).toFixed(2)} img/s)`);
        }
      } catch (e) {
        errors++;
        console.warn(`❌ Failed image_id=${row.image_id} file=${row.filename}: ${e.message}`);
      }
    }
    const total = (Date.now() - t0) / 1000;
    console.log(`✅ Completed: images=${processed}, errors=${errors}, time=${total.toFixed(2)}s`);
    process.exit(errors ? 1 : 0);
  } catch (err) {
    console.error('❌ Rebuild regions script failed:', err);
    process.exit(2);
  } finally {
    try { await db.end?.(); } catch {}
  }
})();

