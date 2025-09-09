// Enhanced OpenCV-based augmentations for robust image search
// Handles blurry images, color variations, lighting conditions
// Returns ImageData-like objects for @xenova/transformers

const { Image } = require("image-js");
const cvModule = require("@techstark/opencv-js");

function getCV() {
    return new Promise((resolve) => {
        const cv = cvModule;
        if (cv && typeof cv.getBuildInformation === "function") return resolve(cv);
        cvModule["onRuntimeInitialized"] = () => resolve(cvModule);
    });
}

async function decodeToImageData(buffer) {
    const img = await Image.load(buffer);
    const rgba = img.getRGBA8(); // Uint8Array RGBA
    return {
        data: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
        width: img.width,
        height: img.height,
    };
}

function toBGRMat(cv, imageData) {
    const src = cv.matFromImageData(imageData); // RGBA
    const bgr = new cv.Mat();
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
    src.delete();
    return bgr; // CV_8UC3 BGR
}

function toImageDataFromBGR(cv, bgr) {
    const rgba = new cv.Mat();
    cv.cvtColor(bgr, rgba, cv.COLOR_BGR2RGBA);
    const out = new Uint8ClampedArray(rgba.data.slice());
    const width = bgr.cols;
    const height = bgr.rows;
    rgba.delete();
    return { data: out, width, height };
}

// Enhanced CLAHE for better contrast in dark/bright images
function applyCLAHE(cv, bgr, clipLimit = 3.0, tileSize = 8) {
    const lab = new cv.Mat();
    cv.cvtColor(bgr, lab, cv.COLOR_BGR2Lab);
    const channels = new cv.MatVector();
    cv.split(lab, channels);
    const l = channels.get(0);
    const a = channels.get(1);
    const bb = channels.get(2);
    const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));
    const cl = new cv.Mat();
    clahe.apply(l, cl);
    channels.set(0, cl);
    const merged = new cv.Mat();
    cv.merge(channels, merged);
    const enhanced = new cv.Mat();
    cv.cvtColor(merged, enhanced, cv.COLOR_Lab2BGR);
    // Cleanup
    lab.delete();
    channels.delete();
    l.delete();
    a.delete();
    bb.delete();
    cl.delete();
    merged.delete();
    clahe.delete();
    return enhanced;
}

function applyGlobalHistEq(cv, bgr) {
    const yuv = new cv.Mat();
    cv.cvtColor(bgr, yuv, cv.COLOR_BGR2YUV);
    const channels = new cv.MatVector();
    cv.split(yuv, channels);
    const y = channels.get(0);
    const u = channels.get(1);
    const v = channels.get(2);
    const eq = new cv.Mat();
    cv.equalizeHist(y, eq);
    channels.set(0, eq);
    const merged = new cv.Mat();
    cv.merge(channels, merged);
    const out = new cv.Mat();
    cv.cvtColor(merged, out, cv.COLOR_YUV2BGR);
    // Cleanup
    yuv.delete();
    channels.delete();
    y.delete();
    u.delete();
    v.delete();
    eq.delete();
    merged.delete();
    return out;
}

function applyGaussianBlur(cv, bgr, ksize = 5, sigma = 1.5) {
    const out = new cv.Mat();
    cv.GaussianBlur(bgr, out, new cv.Size(ksize, ksize), sigma, sigma, cv.BORDER_DEFAULT);
    return out;
}

// New: Unsharp masking for deblurring effect
function applyUnsharpMask(cv, bgr, amount = 1.5, radius = 1.0, threshold = 0) {
    const blurred = new cv.Mat();
    cv.GaussianBlur(bgr, blurred, new cv.Size(0, 0), radius);
    
    const mask = new cv.Mat();
    cv.subtract(bgr, blurred, mask);
    
    const enhanced = new cv.Mat();
    cv.addWeighted(bgr, 1 + amount, mask, -amount, threshold, enhanced);
    
    blurred.delete();
    mask.delete();
    return enhanced;
}

// New: Bilateral filter for noise reduction while preserving edges
function applyBilateralFilter(cv, bgr, d = 9, sigmaColor = 75, sigmaSpace = 75) {
    const out = new cv.Mat();
    cv.bilateralFilter(bgr, out, d, sigmaColor, sigmaSpace);
    return out;
}

// New: Color temperature adjustment for different lighting conditions
function adjustColorTemperature(cv, bgr, temperature = 0) {
    // temperature: -100 (cooler/blue) to +100 (warmer/red)
    const out = bgr.clone();
    const factor = temperature / 100.0;
    
    if (factor !== 0) {
        const channels = new cv.MatVector();
        cv.split(out, channels);
        const b = channels.get(0);
        const g = channels.get(1);
        const r = channels.get(2);
        
        if (factor > 0) {
            // Warmer: increase red, decrease blue
            cv.convertScaleAbs(r, r, 1 + factor * 0.3, 0);
            cv.convertScaleAbs(b, b, 1 - factor * 0.3, 0);
        } else {
            // Cooler: increase blue, decrease red
            cv.convertScaleAbs(b, b, 1 - factor * 0.3, 0);
            cv.convertScaleAbs(r, r, 1 + factor * 0.3, 0);
        }
        
        cv.merge(channels, out);
        channels.delete();
        b.delete();
        g.delete();
        r.delete();
    }
    
    return out;
}

// New: Gamma correction for exposure adjustment
function adjustGamma(cv, bgr, gamma = 1.0) {
    if (gamma === 1.0) return bgr.clone();
    
    // Create lookup table
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        lut[i] = Math.min(255, Math.max(0, Math.round(255 * Math.pow(i / 255.0, 1.0 / gamma))));
    }
    
    const out = new cv.Mat();
    const lutMat = cv.matFromArray(256, 1, cv.CV_8UC1, lut);
    cv.LUT(bgr, lutMat, out);
    
    lutMat.delete();
    return out;
}

// New: HSV color space adjustments
function adjustHSV(cv, bgr, hueShift = 0, satScale = 1.0, valScale = 1.0) {
    const hsv = new cv.Mat();
    cv.cvtColor(bgr, hsv, cv.COLOR_BGR2HSV);
    
    if (hueShift !== 0 || satScale !== 1.0 || valScale !== 1.0) {
        const channels = new cv.MatVector();
        cv.split(hsv, channels);
        const h = channels.get(0);
        const s = channels.get(1);
        const v = channels.get(2);
        
        // Adjust hue (circular shift)
        if (hueShift !== 0) {
            cv.add(h, new cv.Scalar(hueShift), h);
        }
        
        // Adjust saturation
        if (satScale !== 1.0) {
            cv.convertScaleAbs(s, s, satScale, 0);
        }
        
        // Adjust value/brightness
        if (valScale !== 1.0) {
            cv.convertScaleAbs(v, v, valScale, 0);
        }
        
        cv.merge(channels, hsv);
        channels.delete();
        h.delete();
        s.delete();
        v.delete();
    }
    
    const out = new cv.Mat();
    cv.cvtColor(hsv, out, cv.COLOR_HSV2BGR);
    hsv.delete();
    return out;
}

function applyBrightness(cv, bgr, alpha, beta) {
    const out = new cv.Mat();
    cv.convertScaleAbs(bgr, out, alpha, beta);
    return out;
}

// Enhanced augmentation pipeline for robust image search
async function generateAugmentedImageData(buffer) {
    const cv = await getCV();
    const imageData = await decodeToImageData(buffer);

    // Original
    const baseBGR = toBGRMat(cv, imageData);
    const variants = [];

    try {
        // 1. Original (baseline)
        variants.push(toImageDataFromBGR(cv, baseBGR));

        // 2. CLAHE for contrast enhancement (good for dark/bright images)
        const claheBGR = applyCLAHE(cv, baseBGR, 3.0, 8);
        variants.push(toImageDataFromBGR(cv, claheBGR));
        claheBGR.delete();

        // 3. Unsharp masking for deblurring
        const sharpBGR = applyUnsharpMask(cv, baseBGR, 1.5, 1.0, 0);
        variants.push(toImageDataFromBGR(cv, sharpBGR));
        sharpBGR.delete();

        // 4. Bilateral filter for noise reduction
        const denoiseBGR = applyBilateralFilter(cv, baseBGR, 9, 75, 75);
        variants.push(toImageDataFromBGR(cv, denoiseBGR));
        denoiseBGR.delete();

        // 5. Color temperature adjustment (cooler)
        const coolBGR = adjustColorTemperature(cv, baseBGR, -30);
        variants.push(toImageDataFromBGR(cv, coolBGR));
        coolBGR.delete();

        // 6. Color temperature adjustment (warmer)
        const warmBGR = adjustColorTemperature(cv, baseBGR, 30);
        variants.push(toImageDataFromBGR(cv, warmBGR));
        warmBGR.delete();

        // 7. Gamma correction for exposure
        const gammaBGR = adjustGamma(cv, baseBGR, 1.2);
        variants.push(toImageDataFromBGR(cv, gammaBGR));
        gammaBGR.delete();

        // 8. HSV adjustments for different lighting
        const hsvBGR = adjustHSV(cv, baseBGR, 5, 1.1, 1.05);
        variants.push(toImageDataFromBGR(cv, hsvBGR));
        hsvBGR.delete();

        // 9. Global histogram equalization (original augmentation)
        const histEqBGR = applyGlobalHistEq(cv, baseBGR);
        variants.push(toImageDataFromBGR(cv, histEqBGR));
        histEqBGR.delete();

        // 10. Slight brightness adjustments
        const darkBGR = applyBrightness(cv, baseBGR, 0.85, -5);
        variants.push(toImageDataFromBGR(cv, darkBGR));
        darkBGR.delete();

        const brightBGR = applyBrightness(cv, baseBGR, 1.15, 10);
        variants.push(toImageDataFromBGR(cv, brightBGR));
        brightBGR.delete();

    } catch (error) {
        console.warn("Augmentation error:", error.message);
        // Return at least the original if augmentations fail
        if (variants.length === 0) {
            variants.push(toImageDataFromBGR(cv, baseBGR));
        }
    } finally {
        // Cleanup base mat
        baseBGR.delete();
    }

    console.log(`🎨 Generated ${variants.length} image variants for robust search`);
    return variants;
}

module.exports = { 
    generateAugmentedImageData,
    // Export individual functions for testing
    applyCLAHE,
    applyUnsharpMask,
    applyBilateralFilter,
    adjustColorTemperature,
    adjustGamma,
    adjustHSV
};
