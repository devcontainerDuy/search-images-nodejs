// Intelligent augmentation selection based on image characteristics
const { generateAugmentedImageData } = require("../utils/augment");
const imageType = require("image-type");
const { getRobustRecoveryMode } = require("../services/settings.service");
const { decode } = require("image-js");

// Debug logging control (disabled by default for performance)
const DEBUG_SMART_AUGMENT = ["1", "true", "yes"].includes(String(process.env.SMART_AUGMENT_LOG || "").toLowerCase());
const dlog = (...args) => {
    if (DEBUG_SMART_AUGMENT) console.log(...args);
};

/**
 * Analyze image characteristics with enhanced blur and noise detection
 */
async function analyzeImageQuality(buffer) {
    try {
        // Load image from buffer using image-js decode
        let img;
        try {
            const type = imageType(buffer);
            if (type && type.mime === 'image/webp') {
                // Skip deep analysis for webp in this build
                return getBasicAnalysis();
            }
            img = await decode(buffer);
        } catch (loadError) {
            // Keep warning to surface real issues, but avoid chatty logs; silence webp
            const type = imageType(buffer);
            if (!(type && type.mime === 'image/webp')) {
                console.warn("image-js decode failed:", loadError.message);
            }
            // Return basic analysis without detailed processing
            return getBasicAnalysis();
        }

        // Convert to grayscale for analysis
        const gray = img.grey();
        const pixels = gray.data;

        // Enhanced analysis
        const blurInfo = detectBlurType(gray);

        const brightness = calculateBrightness(pixels);
        const contrast = calculateContrast(pixels);
        const sharpness = calculateSharpness(gray);
        const noiseLevel = estimateNoise(pixels);

        const stats = {
            brightness,
            contrast,
            sharpness,
            colorBalance: analyzeColorBalance(img),
            noiseLevel,
            blurType: blurInfo,
            size: { width: img.width, height: img.height },
            // Quality indicators
            isBlurry: sharpness < 0.25, // Increased sensitivity
            isNoisy: noiseLevel > 0.10, // Increased sensitivity
            isLowContrast: contrast < 0.25, // Increased sensitivity
            isDark: brightness < 0.3,
            isBright: brightness > 0.7,
        };

        return stats;
    } catch (error) {
        // Keep warnings for operational visibility
        console.warn("Enhanced image analysis failed:", error.message);
        return null;
    }
}

function analyzeColorBalance(img) {
    try {
        // Use the correct API - image has direct data property
        const { data, channels } = img;
        
        if (!data || channels < 3) {
            // Warn once per call if input is not RGB
            console.warn("Image data not available or not RGB");
            return { r: 0.33, g: 0.33, b: 0.33 };
        }
        
        let rSum = 0, gSum = 0, bSum = 0;
        const pixelCount = data.length / channels;
        
        // Process based on channel count (RGB or RGBA)
        for (let i = 0; i < data.length; i += channels) {
            rSum += data[i];     // Red
            gSum += data[i + 1]; // Green  
            bSum += data[i + 2]; // Blue
            // Skip alpha channel if present
        }

        return {
            r: rSum / pixelCount / 255,
            g: gSum / pixelCount / 255,
            b: bSum / pixelCount / 255,
        };
    } catch (error) {
        console.warn("Color balance analysis failed:", error.message);
        return { r: 0.33, g: 0.33, b: 0.33 }; // Default balanced color
    }
}

function calculateBrightness(pixels) {
    const sum = pixels.reduce((acc, val) => acc + val, 0);
    return sum / pixels.length / 255; // Normalized 0-1
}

// Enhanced blur detection using Laplacian variance
function calculateSharpness(grayImage) {
    const { width, height, data } = grayImage;

    // Laplacian variance method for blur detection
    let laplacianSum = 0;
    let count = 0;

    // Laplacian kernel: [0,-1,0; -1,4,-1; 0,-1,0]
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const center = data[y * width + x];
            const top = data[(y - 1) * width + x];
            const bottom = data[(y + 1) * width + x];
            const left = data[y * width + (x - 1)];
            const right = data[y * width + (x + 1)];

            const laplacian = Math.abs(-top - bottom - left - right + 4 * center);
            laplacianSum += laplacian * laplacian; // Variance
            count++;
        }
    }

    const laplacianVariance = count > 0 ? laplacianSum / count : 0;

    // Normalize to 0-1 range (empirically determined thresholds)
    return Math.min(1.0, laplacianVariance / 1000.0);
}

// Enhanced noise detection using local standard deviation
function estimateNoise(pixels) {
    const windowSize = 3;
    let noiseSum = 0;
    let windowCount = 0;

    // Calculate local standard deviation in small windows
    for (let i = windowSize; i < pixels.length - windowSize; i += windowSize * 2) {
        const window = pixels.slice(i - windowSize, i + windowSize + 1);
        const mean = window.reduce((a, b) => a + b, 0) / window.length;
        const variance = window.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / window.length;
        const stdDev = Math.sqrt(variance);

        noiseSum += stdDev;
        windowCount++;
    }

    const avgNoise = windowCount > 0 ? noiseSum / windowCount : 0;

    // Normalize to 0-1 range
    return Math.min(1.0, avgNoise / 50.0);
}

// Enhanced contrast detection
function calculateContrast(pixels) {
    // Calculate RMS contrast (more accurate than simple variance)
    const mean = pixels.reduce((acc, val) => acc + val, 0) / pixels.length;
    const rmsContrast = Math.sqrt(pixels.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / pixels.length);

    // Normalize to 0-1 range
    return Math.min(1.0, rmsContrast / 128.0);
}

// Detect motion blur vs focus blur
function detectBlurType(grayImage) {
    const { width, height, data } = grayImage;

    // Calculate gradients in X and Y directions
    let gradX = 0,
        gradY = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const gx = data[y * width + (x + 1)] - data[y * width + (x - 1)];
            const gy = data[(y + 1) * width + x] - data[(y - 1) * width + x];

            gradX += Math.abs(gx);
            gradY += Math.abs(gy);
            count++;
        }
    }

    const avgGradX = count > 0 ? gradX / count : 0;
    const avgGradY = count > 0 ? gradY / count : 0;

    const ratio = avgGradX > 0 && avgGradY > 0 ? Math.max(avgGradX, avgGradY) / Math.min(avgGradX, avgGradY) : 1;

    return {
        isMotionBlur: ratio > 1.5, // Higher ratio suggests directional blur
        direction: avgGradX > avgGradY ? "horizontal" : "vertical",
        strength: Math.max(avgGradX, avgGradY) / 255.0,
    };
}

/**
 * Generate smart augmentations with enhanced blur/noise focus
 */
async function generateSmartAugmentations(buffer, analysis = null) {
    analysis = analysis || (await analyzeImageQuality(buffer));

    if (!analysis) {
        dlog("🔄 Using enhanced default augmentation pipeline");
        return generateAugmentedImageData(buffer);
    }

    dlog("📊 Enhanced Image Analysis:", {
        brightness: analysis.brightness.toFixed(2),
        contrast: analysis.contrast.toFixed(2),
        sharpness: analysis.sharpness.toFixed(2),
        noise: analysis.noiseLevel.toFixed(2),
        isBlurry: analysis.isBlurry,
        isNoisy: analysis.isNoisy,
        blurType: analysis.blurType.isMotionBlur ? `motion (${analysis.blurType.direction})` : "focus",
    });

    // Enhanced strategy for blur and noise
    const recommendations = [];

    // Critical: Blurry images get priority treatment
    if (analysis.isBlurry) {
        recommendations.push("🔍 CRITICAL: Blurry image detected");
        if (analysis.blurType.isMotionBlur) {
            recommendations.push(`🏃 Motion blur (${analysis.blurType.direction}) - applying directional deblurring`);
        } else {
            recommendations.push("� Focus blur - applying multi-scale unsharp masking");
        }
    }

    // Critical: Noisy images
    if (analysis.isNoisy) {
        recommendations.push("🧹 CRITICAL: High noise detected - applying advanced denoising");
    }

    // Other issues
    if (analysis.isLowContrast) {
        recommendations.push("📈 Low contrast - enhanced CLAHE needed");
    }

    if (analysis.isDark) {
        recommendations.push("🌙 Dark image - brightness and gamma correction");
    }

    if (analysis.isBright) {
        recommendations.push("☀️ Bright image - exposure reduction needed");
    }

    // Color balance
    const { r, g, b } = analysis.colorBalance;
    if (Math.abs(r - g) > 0.08 || Math.abs(g - b) > 0.08 || Math.abs(r - b) > 0.08) {
        recommendations.push("🎨 Color imbalance - temperature/HSV correction");
    }

    dlog("🔧 Smart Recommendations:");
    recommendations.forEach((rec) => dlog(`   ${rec}`));

    // Decide variant budget based on severity to speed up
    const severe = analysis.isBlurry || analysis.isNoisy;
    const moderate = analysis.isLowContrast || analysis.isDark || analysis.isBright;
    const robust = getRobustRecoveryMode();
    // Allocate more variants if robust mode is on
    const maxVariants = severe ? (robust ? 18 : 12) : moderate ? (robust ? 12 : 8) : (robust ? 6 : 4);
    dlog(`🚀 Applying augmentation with maxVariants=${maxVariants} (robust=${robust})`);

    return generateAugmentedImageData(buffer, { maxVariants, robust });
}

/**
 * Fallback basic analysis when image-js fails
 */
function getBasicAnalysis() {
    return {
        brightness: 0.5,
        contrast: 0.4,
        sharpness: 0.3, // Assume potentially blurry
        colorBalance: { r: 0.33, g: 0.33, b: 0.33 },
        noiseLevel: 0.2, // Assume some noise
        blurType: { isMotionBlur: false, direction: "unknown", strength: 0.5 },
        size: { width: 1024, height: 1024 },
        // Conservative quality indicators for safety
        isBlurry: true, // Assume blurry to apply deblurring
        isNoisy: true,  // Assume noisy to apply denoising
        isLowContrast: true,
        isDark: false,
        isBright: false,
    };
}

module.exports = {
    analyzeImageQuality,
    generateSmartAugmentations,
    calculateBrightness,
    calculateContrast,
    calculateSharpness,
};
