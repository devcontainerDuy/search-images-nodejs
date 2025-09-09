#!/usr/bin/env node
// Test the enhanced create function with embedding generation

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

async function testCreateFunction() {
    console.log('=== TESTING ENHANCED CREATE FUNCTION ===');
    
    try {
        // Check if we have test images
        const imagesDir = path.join(__dirname, '..', 'public', 'uploads', 'images');
        const files = fs.readdirSync(imagesDir);
        
        if (files.length === 0) {
            console.log('❌ No test images found');
            return;
        }
        
        // Use the first image as test
        const testImagePath = path.join(imagesDir, files[0]);
        const testImageBuffer = fs.readFileSync(testImagePath);
        
        console.log(`🧪 Testing upload with: ${files[0]} (${(testImageBuffer.length/1024).toFixed(2)} KB)`);
        
        // Create form data
        const formData = new FormData();
        formData.append('image', testImageBuffer, `test-${Date.now()}-${files[0]}`);
        formData.append('title', 'Test Upload with Enhanced Embedding');
        formData.append('description', 'Testing the enhanced create function with improved embedding generation');
        formData.append('tags', 'test,embedding,enhanced');
        
        // Test the API endpoint
        console.log('📤 Sending upload request...');
        
        const response = await axios.post('http://localhost:3000/api/images', formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Length': formData.getLengthSync()
            },
            timeout: 30000 // 30 second timeout for embedding generation
        });
        
        console.log('✅ Upload response received:');
        console.log('📊 Status:', response.status);
        console.log('📝 Message:', response.data.message);
        console.log('📈 Stats:', {
            files_processed: response.data.total_files_processed,
            items_created: response.data.count,
            embeddings_generated: response.data.embeddings_generated,
            embeddings_failed: response.data.embeddings_failed
        });
        
        if (response.data.items && response.data.items.length > 0) {
            const item = response.data.items[0];
            console.log('🔍 First item details:', {
                id: item.id,
                filename: item.filename,
                embedding_generated: item.embedding_generated,
                embedding_dimension: item.embedding_dimension,
                model_used: item.model_used,
                embedding_error: item.embedding_error
            });
        }
        
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error('❌ Server not running. Please start the server first:');
            console.log('   cd nodejs && npm start');
        } else {
            console.error('❌ Test failed:', error.message);
            if (error.response) {
                console.error('📄 Response data:', error.response.data);
            }
        }
    }
}

// Run test
if (require.main === module) {
    testCreateFunction();
}

module.exports = { testCreateFunction };
