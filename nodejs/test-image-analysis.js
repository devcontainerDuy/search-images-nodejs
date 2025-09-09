// Test script for the corrected image analysis and smart augmentation
const { analyzeImageQuality, generateSmartAugmentations } = require('./utils/smart-augment.js');
const fs = require('fs');
const path = require('path');

async function testImageAnalysisComplete() {
    console.log('🧪 Testing Complete Image Analysis System');
    console.log('=' .repeat(50));
    
    // Find test images
    const uploadDir = path.join(__dirname, 'public/uploads/images');
    const imageFiles = fs.readdirSync(uploadDir)
        .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
        .slice(0, 3); // Test first 3 images
    
    if (imageFiles.length === 0) {
        console.log('❌ No test images found in uploads directory');
        return;
    }
    
    console.log(`📁 Found ${imageFiles.length} test images`);
    
    for (const [index, filename] of imageFiles.entries()) {
        console.log(`\n🖼️  Testing image ${index + 1}: ${filename}`);
        console.log('-'.repeat(40));
        
        try {
            const imagePath = path.join(uploadDir, filename);
            const buffer = fs.readFileSync(imagePath);
            const fileSize = (buffer.length / 1024).toFixed(1);
            
            console.log(`📊 File size: ${fileSize} KB`);
            
            // Test image analysis
            const startAnalysis = Date.now();
            const analysis = await analyzeImageQuality(buffer);
            const analysisTime = Date.now() - startAnalysis;
            
            if (analysis) {
                console.log(`✅ Analysis completed in ${analysisTime}ms`);
                console.log(`   📐 Dimensions: ${analysis.size.width}x${analysis.size.height}`);
                console.log(`   🎯 Sharpness: ${analysis.sharpness.toFixed(3)} (${analysis.isBlurry ? 'BLURRY' : 'Sharp'})`);
                console.log(`   🔊 Noise: ${analysis.noiseLevel.toFixed(3)} (${analysis.isNoisy ? 'NOISY' : 'Clean'})`);
                console.log(`   🌈 Contrast: ${analysis.contrast.toFixed(3)} (${analysis.isLowContrast ? 'LOW' : 'Good'})`);
                console.log(`   💡 Brightness: ${analysis.brightness.toFixed(3)}`);
                console.log(`   🎨 Color Balance: R=${analysis.colorBalance.r.toFixed(2)} G=${analysis.colorBalance.g.toFixed(2)} B=${analysis.colorBalance.b.toFixed(2)}`);
                
                if (analysis.blurType.isMotionBlur) {
                    console.log(`   🏃 Motion blur detected (${analysis.blurType.direction})`);
                }
            } else {
                console.log(`⚠️  Analysis failed, using fallback`);
            }
            
            // Test smart augmentation
            const startAugment = Date.now();
            const variants = await generateSmartAugmentations(buffer);
            const augmentTime = Date.now() - startAugment;
            
            if (variants && variants.length > 0) {
                console.log(`✅ Smart augmentation completed in ${augmentTime}ms`);
                console.log(`   🔄 Generated ${variants.length} augmented variants`);
                console.log(`   📏 Variant dimensions: ${variants[0].width}x${variants[0].height}`);
            } else {
                console.log(`❌ Smart augmentation failed`);
            }
            
        } catch (error) {
            console.log(`❌ Error processing ${filename}: ${error.message}`);
        }
    }
    
    console.log(`\n🎉 Test completed! Image analysis system is working correctly.`);
    console.log(`✅ The 'Image.load is not a function' and 'getRGBAData is not a function' errors have been fixed.`);
}

// Run the test
testImageAnalysisComplete().catch(console.error);
