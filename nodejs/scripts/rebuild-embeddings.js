#!/usr/bin/env node
// Rebuild base embeddings for images missing current-model vectors, newest first
require('dotenv').config();
const path = require('path');
const fs = require('fs/promises');
const db = require('../config/database');
const { getModelId, embedImageFromBufferWithAugment } = require('../services/clip.service');
const { getMissingImageIdsForModelOrdered, upsertEmbedding } = require('../models/embeddings');
const { getAugmentationEnabled } = require('../services/settings.service');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: 0, order: 'DESC' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--limit' && args[i+1]) { opts.limit = parseInt(args[++i], 10) || 0; }
    else if (a === '--order' && args[i+1]) { opts.order = (args[++i] || 'DESC').toUpperCase(); }
    else if (a === '-n' && args[i+1]) { opts.limit = parseInt(args[++i], 10) || 0; }
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node scripts/rebuild-embeddings.js [--limit N] [--order DESC|ASC]');
      process.exit(0);
    }
  }
  return opts;
}

(async () => {
  const t0 = Date.now();
  const { limit, order } = parseArgs();
  const modelId = getModelId();
  const useAug = getAugmentationEnabled();

  console.log(`🔄 Rebuilding embeddings (model=${modelId}, aug=${useAug}, order=${order}, limit=${limit||'∞'})`);

  try {
    const rows = await getMissingImageIdsForModelOrdered(modelId, { limit, order });
    if (!rows.length) {
      console.log('✅ No missing embeddings. Nothing to do.');
      process.exit(0);
    }
    let processed = 0, errors = 0;
    for (const row of rows) {
      const abs = path.join(__dirname, '..', row.file_path);
      try {
        const buf = await fs.readFile(abs);
        const vec = await embedImageFromBufferWithAugment(buf, useAug, true);
        await upsertEmbedding(row.id, modelId, vec);
        processed++;
        if (processed % 10 === 0) {
          const dt = (Date.now() - t0) / 1000;
          console.log(`... ${processed}/${rows.length} done (${(processed/dt).toFixed(2)} img/s)`);
        }
      } catch (e) {
        errors++;
        console.warn(`❌ Failed id=${row.id} file=${row.filename}: ${e.message}`);
      }
    }
    const total = (Date.now() - t0) / 1000;
    console.log(`✅ Completed: processed=${processed}, errors=${errors}, time=${total.toFixed(2)}s`);
    process.exit(errors ? 1 : 0);
  } catch (err) {
    console.error('❌ Rebuild embeddings script failed:', err);
    process.exit(2);
  } finally {
    try { await db.end?.(); } catch {}
  }
})();

