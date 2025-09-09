#!/usr/bin/env node
// Test script for smart augmentation with blur/color handling

const fs = require('fs');
const path = require('path');
const { analyzeImageQuality, generateSmartAugmentations } = require('../utils/smart-augment');

async function testSmartAugmentation() {
    console.log('🧠 Testing Smart Augmentation Pipeline');
    console.log('=====================================');
    
    try {
        // Find test images
        const imagesDir = path.join(__dirname, '..', 'public', 'uploads', 'images');
        const files = fs.readdirSync(imagesDir).slice(0, 3); // Test first 3 images
        
        if (files.length === 0) {
            console.log('❌ No test images found');
            return;
        }
        
        for (const filename of files) {
            console.log(`\n🖼️  Analyzing: ${filename}`);
            console.log('-'.repeat(50));
            
            const filePath = path.join(imagesDir, filename);
            const buffer = fs.readFileSync(filePath);
            
            // Analyze image quality
            const analysis = await analyzeImageQuality(buffer);
            if (analysis) {
                console.log('📊 Image Quality Analysis:');
                console.log(`   Brightness: ${(analysis.brightness * 100).toFixed(1)}%`);
                console.log(`   Contrast: ${(analysis.contrast * 100).toFixed(1)}%`);
                console.log(`   Sharpness: ${(analysis.sharpness * 100).toFixed(1)}%`);
                console.log(`   Noise Level: ${(analysis.noiseLevel * 100).toFixed(1)}%`);
                console.log(`   Color Balance: R:${(analysis.colorBalance.r * 100).toFixed(1)}% G:${(analysis.colorBalance.g * 100).toFixed(1)}% B:${(analysis.colorBalance.b * 100).toFixed(1)}%`);
                console.log(`   Size: ${analysis.size.width}x${analysis.size.height}`);
                
                // Provide recommendations
                console.log('\n🔧 Recommendations:');
                if (analysis.brightness < 0.25) console.log('   ⚡ Apply brightness boost (dark image)');
                if (analysis.brightness > 0.75) console.log('   🌙 Apply brightness reduction (bright image)');
                if (analysis.contrast < 0.15) console.log('   📈 Apply contrast enhancement (low contrast)');
                if (analysis.sharpness < 0.1) console.log('   🔍 Apply deblurring (low sharpness)');
                if (analysis.noiseLevel > 0.15) console.log('   🧹 Apply noise reduction (high noise)');
                
                const { r, g, b } = analysis.colorBalance;
                if (Math.abs(r - g) > 0.1 || Math.abs(g - b) > 0.1 || Math.abs(r - b) > 0.1) {
                    console.log('   🎨 Apply color correction (color imbalance)');
                }
            }
            
            // Test smart augmentation
            console.log('\n🚀 Testing Smart Augmentation...');
            const startTime = Date.now();
            const variants = await generateSmartAugmentations(buffer);
            const processingTime = Date.now() - startTime;
            
            console.log(`✅ Generated ${variants.length} smart variants in ${processingTime}ms`);
            variants.forEach((variant, index) => {
                console.log(`   Variant ${index + 1}: ${variant.width}x${variant.height}`);
            });
        }
        
        console.log('\n🎯 Smart Augmentation Features:');
        console.log('✓ Automatic blur detection and correction');
        console.log('✓ Color temperature invariance');
        console.log('✓ Adaptive contrast enhancement');
        console.log('✓ Intelligent noise reduction');
        console.log('✓ Exposure compensation');
        console.log('✓ Color balance correction');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run test
if (require.main === module) {
    testSmartAugmentation();
}

module.exports = { testSmartAugmentation };
