#!/usr/bin/env node
// Test embedding process in create function

require('dotenv').config();
const { getModelId } = require('../services/clip.service');
const { upsertEmbedding } = require('../models/embeddings');
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function testEmbeddingProcess() {
    console.log('=== TESTING EMBEDDING PROCESS IN CREATE FUNCTION ===');
    
    try {
        // Test 1: Check model ID
        const modelId = getModelId();
        console.log('🤖 Model ID:', modelId);
        
        // Test 2: Check current embeddings
        const [embeddings] = await db.query('SELECT COUNT(*) as count FROM image_embeddings');
        console.log('🧠 Current embeddings in DB:', embeddings[0].count);
        
        // Test 3: Check if we have images to test with
        const [images] = await db.query('SELECT id, filename FROM images LIMIT 3');
        console.log('📸 Available images for testing:', images.length);
        
        if (images.length === 0) {
            console.log('❌ No images found for testing');
            return;
        }
        
        // Test 4: Check which images are missing embeddings
        const [missing] = await db.query(`
            SELECT i.id, i.filename 
            FROM images i 
            WHERE NOT EXISTS (
                SELECT 1 FROM image_embeddings e 
                WHERE e.image_id = i.id AND e.model = ?
            ) 
            LIMIT 3
        `, [modelId]);
        
        console.log('📊 Images missing embeddings:', missing.length);
        missing.forEach(img => console.log(`   - ID ${img.id}: ${img.filename}`));
        
        // Test 5: Test embedding insertion
        if (missing.length > 0) {
            const testImageId = missing[0].id;
            const testEmbedding = new Array(512).fill(0).map(() => Math.random());
            
            console.log(`\n🧪 Testing embedding for image ID ${testImageId}...`);
            console.log('📊 Test embedding info:', {
                dimension: testEmbedding.length,
                sample: testEmbedding.slice(0, 3).map(v => v.toFixed(4))
            });
            
            await upsertEmbedding(testImageId, modelId, testEmbedding);
            console.log('✅ Test embedding saved successfully');
            
            // Verify insertion
            const [newCount] = await db.query('SELECT COUNT(*) as count FROM image_embeddings');
            console.log('🧠 Embeddings after test:', newCount[0].count);
            
            // Check the specific embedding
            const [specific] = await db.query('SELECT dim, LENGTH(embedding) as embed_size FROM image_embeddings WHERE image_id = ? AND model = ?', [testImageId, modelId]);
            if (specific.length > 0) {
                console.log('🔍 Saved embedding details:', {
                    dimension: specific[0].dim,
                    embedding_json_size: specific[0].embed_size
                });
            }
        }
        
        console.log('\n✅ Embedding process test completed');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await db.end();
    }
}

// Run test
if (require.main === module) {
    testEmbeddingProcess();
}

module.exports = { testEmbeddingProcess };
