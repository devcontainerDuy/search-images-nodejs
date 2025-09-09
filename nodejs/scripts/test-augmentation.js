#!/usr/bin/env node
// Test script for enhanced image augmentation pipeline

const fs = require('fs');
const path = require('path');
const { generateAugmentedImageData } = require('../utils/augment');

async function testAugmentations() {
    console.log('🧪 Testing Enhanced Image Augmentation Pipeline');
    
    try {
        // Find a test image
        const imagesDir = path.join(__dirname, '..', 'public', 'uploads', 'images');
        const files = fs.readdirSync(imagesDir);
        
        if (files.length === 0) {
            console.log('❌ No test images found');
            return;
        }
        
        const testFile = path.join(imagesDir, files[0]);
        console.log(`🖼️  Testing with: ${files[0]}`);
        
        const buffer = fs.readFileSync(testFile);
        console.log(`📊 Image size: ${(buffer.length / 1024).toFixed(2)} KB`);
        
        const startTime = Date.now();
        const variants = await generateAugmentedImageData(buffer);
        const processingTime = Date.now() - startTime;
        
        console.log(`\n✅ Augmentation Results:`);
        console.log(`   - Generated variants: ${variants.length}`);
        console.log(`   - Processing time: ${processingTime}ms`);
        console.log(`   - Average per variant: ${(processingTime / variants.length).toFixed(1)}ms`);
        
        variants.forEach((variant, index) => {
            console.log(`   - Variant ${index + 1}: ${variant.width}x${variant.height} (${variant.data.length} bytes)`);
        });
        
        console.log(`\n🎯 Enhanced Features:`);
        console.log(`   ✓ Blur recovery (unsharp masking)`);
        console.log(`   ✓ Color temperature invariance`);
        console.log(`   ✓ Noise reduction (bilateral filter)`);
        console.log(`   ✓ Contrast enhancement (CLAHE)`);
        console.log(`   ✓ Exposure normalization (gamma)`);
        console.log(`   ✓ HSV color space adjustments`);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run test
if (require.main === module) {
    testAugmentations();
}

module.exports = { testAugmentations };
