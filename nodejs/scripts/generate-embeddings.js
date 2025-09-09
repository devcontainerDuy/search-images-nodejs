#!/usr/bin/env node
// Script to generate missing embeddings for existing images

require('dotenv').config();
const { getModelId } = require('../services/clip.service');
const { getMissingImageIdsForModel, upsertEmbedding } = require('../models/embeddings');
const { embedImageFromBufferWithAugment } = require('../services/clip.service');
const fs = require('fs');
const path = require('path');

async function generateMissingEmbeddings() {
    console.log('🚀 Starting embedding generation for existing images...');
    
    try {
        const modelId = getModelId();
        console.log(`🤖 Using model: ${modelId}`);
        
        const missing = await getMissingImageIdsForModel(modelId);
        console.log(`📊 Found ${missing.length} images without embeddings`);
        
        if (missing.length === 0) {
            console.log('✅ All images already have embeddings!');
            return;
        }
        
        let processed = 0;
        let errors = 0;
        
        for (const row of missing) {
            try {
                console.log(`🔄 Processing ${row.filename} (ID: ${row.id})...`);
                
                // Read image file
                const absPath = path.join(__dirname, '..', row.file_path);
                const buffer = fs.readFileSync(absPath);
                
                // Generate embedding
                const embedding = await embedImageFromBufferWithAugment(buffer, true);
                
                // Save to database
                await upsertEmbedding(row.id, modelId, Array.from(embedding));
                
                processed++;
                console.log(`✅ Saved embedding for ${row.filename} (${processed}/${missing.length})`);
                
            } catch (error) {
                errors++;
                console.error(`❌ Failed to process ${row.filename}:`, error.message);
            }
        }
        
        console.log(`\n🎉 Generation complete!`);
        console.log(`✅ Processed: ${processed}`);
        console.log(`❌ Errors: ${errors}`);
        console.log(`📊 Total: ${missing.length}`);
        
    } catch (error) {
        console.error('❌ Script failed:', error);
    }
    
    process.exit(0);
}

// Run if called directly
if (require.main === module) {
    generateMissingEmbeddings();
}

module.exports = { generateMissingEmbeddings };
