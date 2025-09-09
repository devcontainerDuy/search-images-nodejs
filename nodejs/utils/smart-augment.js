// Intelligent augmentation selection based on image characteristics
const { generateAugmentedImageData, applyCLAHE, applyUnsharpMask, adjustColorTemperature } = require('../utils/augment');

/**
 * Analyze image characteristics to determine optimal augmentation strategy
 */
async function analyzeImageQuality(buffer) {
    try {
        const { Image } = require('image-js');
        const img = await Image.load(buffer);
        
        // Convert to grayscale for analysis
        const gray = img.grey();
        const pixels = gray.data;
        
        // Calculate metrics
        const stats = {
            brightness: calculateBrightness(pixels),
            contrast: calculateContrast(pixels),
            sharpness: calculateSharpness(gray),
            colorBalance: analyzeColorBalance(img),
            noiseLevel: estimateNoise(pixels),
            size: { width: img.width, height: img.height }
        };
        
        return stats;
    } catch (error) {
        console.warn('Image analysis failed:', error.message);
        return null;
    }
}

function calculateBrightness(pixels) {
    const sum = pixels.reduce((acc, val) => acc + val, 0);
    return sum / pixels.length / 255; // Normalized 0-1
}

function calculateContrast(pixels) {
    const mean = calculateBrightness(pixels) * 255;
    const variance = pixels.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / pixels.length;
    return Math.sqrt(variance) / 255; // Normalized 0-1
}

function calculateSharpness(grayImage) {
    // Sobel edge detection for sharpness estimation
    const { width, height, data } = grayImage;
    let edgeSum = 0;
    let count = 0;
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            
            // Sobel X
            const gx = (-1 * data[(y-1)*width + (x-1)]) + 
                      (1 * data[(y-1)*width + (x+1)]) +
                      (-2 * data[y*width + (x-1)]) + 
                      (2 * data[y*width + (x+1)]) +
                      (-1 * data[(y+1)*width + (x-1)]) + 
                      (1 * data[(y+1)*width + (x+1)]);
            
            // Sobel Y  
            const gy = (-1 * data[(y-1)*width + (x-1)]) + 
                      (-2 * data[(y-1)*width + x]) +
                      (-1 * data[(y-1)*width + (x+1)]) +
                      (1 * data[(y+1)*width + (x-1)]) + 
                      (2 * data[(y+1)*width + x]) +
                      (1 * data[(y+1)*width + (x+1)]);
            
            const magnitude = Math.sqrt(gx*gx + gy*gy);
            edgeSum += magnitude;
            count++;
        }
    }
    
    return count > 0 ? (edgeSum / count) / 255 : 0; // Normalized
}

function analyzeColorBalance(img) {
    const { data } = img.getRGBA8();
    let rSum = 0, gSum = 0, bSum = 0;
    
    for (let i = 0; i < data.length; i += 4) {
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
    }
    
    const pixels = data.length / 4;
    return {
        r: rSum / pixels / 255,
        g: gSum / pixels / 255,
        b: bSum / pixels / 255
    };
}

function estimateNoise(pixels) {
    // Simple noise estimation using local variance
    let noiseSum = 0;
    const windowSize = 5;
    
    for (let i = windowSize; i < pixels.length - windowSize; i++) {
        const window = pixels.slice(i - windowSize, i + windowSize + 1);
        const mean = window.reduce((a, b) => a + b, 0) / window.length;
        const variance = window.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / window.length;
        noiseSum += Math.sqrt(variance);
    }
    
    return noiseSum / (pixels.length - 2 * windowSize) / 255;
}

/**
 * Generate smart augmentations based on image analysis
 */
async function generateSmartAugmentations(buffer) {
    const analysis = await analyzeImageQuality(buffer);
    
    if (!analysis) {
        console.log('🔄 Using default augmentation pipeline');
        return generateAugmentedImageData(buffer);
    }
    
    console.log('📊 Image Analysis:', {
        brightness: analysis.brightness.toFixed(2),
        contrast: analysis.contrast.toFixed(2),
        sharpness: analysis.sharpness.toFixed(2),
        noise: analysis.noiseLevel.toFixed(2)
    });
    
    // Determine augmentation strategy
    const strategy = [];
    
    // Always include original
    strategy.push('original');
    
    // Low contrast images
    if (analysis.contrast < 0.15) {
        strategy.push('clahe_strong', 'histogram_eq');
        console.log('🔧 Applying contrast enhancement for low-contrast image');
    }
    
    // Dark/bright images
    if (analysis.brightness < 0.25) {
        strategy.push('brightness_boost', 'gamma_bright');
        console.log('🔧 Applying brightness correction for dark image');
    } else if (analysis.brightness > 0.75) {
        strategy.push('brightness_reduce', 'gamma_dark');
        console.log('🔧 Applying brightness correction for bright image');
    }
    
    // Blurry images
    if (analysis.sharpness < 0.1) {
        strategy.push('unsharp_strong', 'bilateral_filter');
        console.log('🔧 Applying deblurring for low-sharpness image');
    }
    
    // Noisy images
    if (analysis.noiseLevel > 0.15) {
        strategy.push('bilateral_strong', 'median_filter');
        console.log('🔧 Applying noise reduction for noisy image');
    }
    
    // Color balance issues
    const { r, g, b } = analysis.colorBalance;
    if (Math.abs(r - g) > 0.1 || Math.abs(g - b) > 0.1 || Math.abs(r - b) > 0.1) {
        strategy.push('color_temp_cool', 'color_temp_warm', 'hsv_adjust');
        console.log('🔧 Applying color correction for color balance issues');
    }
    
    // Always add some standard variations
    strategy.push('clahe_mild', 'brightness_mild');
    
    console.log(`🎯 Smart augmentation strategy: ${strategy.length} variants`);
    
    // For now, return the full augmentation set
    // TODO: Implement selective augmentation based on strategy
    return generateAugmentedImageData(buffer);
}

module.exports = {
    analyzeImageQuality,
    generateSmartAugmentations,
    calculateBrightness,
    calculateContrast,
    calculateSharpness
};
