// Enhanced OpenCV-based augmentations for robust image search
// Handles blurry images, color variations, lighting conditions
// Returns ImageData-like objects for @xenova/transformers

const I = require("image-js");

// minimize repeated warnings
let WARNED = {
    opencvNotReady: false,
    bilateralMissing: false,
    bilateralFailed: false,
    deconvolutionFailed: false,
};
const cvModule = require("@techstark/opencv-js");

function getCV() {
    return new Promise((resolve) => {
        const cv = cvModule;
        if (cv && typeof cv.getBuildInformation === "function") return resolve(cv);
        let resolved = false;
        try {
            cvModule["onRuntimeInitialized"] = () => {
                resolved = true;
                resolve(cvModule);
            };
        } catch (_) {}
        // Fallback: resolve after timeout to avoid hanging if runtime never initializes
        setTimeout(() => {
            if (!resolved) resolve(cvModule);
        }, 3000);
    });
}

async function decodeToImageData(buffer) {
    const img = await I.decode(buffer);
    const { width, height, data, channels } = img;

    // Ensure RGBA output
    let rgba;
    if (channels === 4) {
        rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    } else if (channels === 3) {
        rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
            rgba[j] = data[i];
            rgba[j + 1] = data[i + 1];
            rgba[j + 2] = data[i + 2];
            rgba[j + 3] = 255;
        }
    } else if (channels === 1) {
        rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0, j = 0; i < data.length; i += 1, j += 4) {
            const v = data[i];
            rgba[j] = v;
            rgba[j + 1] = v;
            rgba[j + 2] = v;
            rgba[j + 3] = 255;
        }
    } else {
        // Fallback: try to convert to grey then expand
        const grey = img.grey();
        const gdata = grey.data;
        rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0, j = 0; i < gdata.length; i += 1, j += 4) {
            const v = gdata[i];
            rgba[j] = v;
            rgba[j + 1] = v;
            rgba[j + 2] = v;
            rgba[j + 3] = 255;
        }
    }

    return { data: rgba, width, height };
}

function imageToImageData(img) {
    // Ensure RGBA color model
    let rgbaImg = img;
    if (img.channels !== 4 || (img.colorModel && img.colorModel !== 'RGBA')) {
        try {
            rgbaImg = img.convertColor('RGBA');
        } catch (_) {
            // Fallback: try grey then expand
            const g = img.grey();
            const width = g.width;
            const height = g.height;
            const out = new Uint8ClampedArray(width * height * 4);
            for (let i = 0, j = 0; i < g.data.length; i++, j += 4) {
                const v = g.data[i];
                out[j] = v; out[j + 1] = v; out[j + 2] = v; out[j + 3] = 255;
            }
            return { data: out, width, height };
        }
    }
    const { width, height, data } = rgbaImg;
    const out = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    return { data: out, width, height };
}

async function generateGeometricVariants(buffer) {
    const img = await I.decode(buffer);
    const variants = [];
    try {
        const { width, height } = img;
        // 1. Center crop 90%
        const w1 = Math.max(1, Math.floor(width * 0.9));
        const h1 = Math.max(1, Math.floor(height * 0.9));
        const x1 = Math.floor((width - w1) / 2);
        const y1 = Math.floor((height - h1) / 2);
        variants.push(imageToImageData(img.crop({ x: x1, y: y1, width: w1, height: h1 })));

        // 2. Center crop 70%
        const w2 = Math.max(1, Math.floor(width * 0.7));
        const h2 = Math.max(1, Math.floor(height * 0.7));
        const x2 = Math.floor((width - w2) / 2);
        const y2 = Math.floor((height - h2) / 2);
        variants.push(imageToImageData(img.crop({ x: x2, y: y2, width: w2, height: h2 })));

        // 3. Top-left crop 80%
        const w3 = Math.max(1, Math.floor(width * 0.8));
        const h3 = Math.max(1, Math.floor(height * 0.8));
        variants.push(imageToImageData(img.crop({ x: 0, y: 0, width: w3, height: h3 })));

        // 4. Horizontal flip
        variants.push(imageToImageData(img.flip({ x: true, y: false })));

        // 5. Rotate +8 degrees (fill with nearest)
        try {
            variants.push(imageToImageData(img.rotate(8)));
        } catch (_) {}
        // 6. Rotate -8 degrees
        try {
            variants.push(imageToImageData(img.rotate(-8)));
        } catch (_) {}
    } catch (e) {
        console.warn('Geometric variants generation failed:', e.message);
    }
    return variants;
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

// Enhanced Unsharp masking with multiple scales for better deblurring
function applyUnsharpMask(cv, bgr, amount = 2.0, radius = 1.5, threshold = 0) {
    const out = bgr.clone();

    try {
        // Multi-scale unsharp masking for better blur recovery
        const scales = [
            { radius: 0.5, weight: 0.3 },
            { radius: 1.0, weight: 0.4 },
            { radius: 2.0, weight: 0.3 },
        ];

        for (const scale of scales) {
            const blurred = new cv.Mat();
            const ksize = Math.max(3, Math.round(scale.radius * 6) | 1); // Ensure odd
            cv.GaussianBlur(bgr, blurred, new cv.Size(ksize, ksize), scale.radius);

            const mask = new cv.Mat();
            cv.subtract(bgr, blurred, mask);

            const weighted = new cv.Mat();
            cv.convertScaleAbs(mask, weighted, amount * scale.weight, 0);

            cv.add(out, weighted, out);

            blurred.delete();
            mask.delete();
            weighted.delete();
        }

        // Apply threshold if specified
        if (threshold > 0) {
            cv.threshold(out, out, threshold, 255, cv.THRESH_TOZERO);
        }
    } catch (error) {
        console.warn("Unsharp mask failed:", error.message);
        return bgr.clone();
    }

    return out;
}

// Enhanced bilateral filter with adaptive parameters
function applyBilateralFilter(cv, bgr, d = 9, sigmaColor = 80, sigmaSpace = 80) {
    const out = new cv.Mat();

    try {
        // Apply bilateral filter multiple times for heavy noise
        let temp = bgr.clone();

        // First pass: strong denoising
        if (typeof cv.bilateralFilter === 'function') {
            cv.bilateralFilter(temp, out, d, sigmaColor, sigmaSpace);
        } else {
            if (!WARNED.bilateralMissing) {
                console.warn("ℹ️ OpenCV build lacks bilateralFilter; using GaussianBlur fallback");
                WARNED.bilateralMissing = true;
            }
            // Fallback to Gaussian blur if bilateral is unavailable in this build
            cv.GaussianBlur(temp, out, new cv.Size(Math.max(3, d | 1), Math.max(3, d | 1)), sigmaColor / 50);
        }
        temp.delete();
        temp = out.clone();

        // Second pass: mild denoising to preserve details
        if (typeof cv.bilateralFilter === 'function') {
            cv.bilateralFilter(temp, out, 5, sigmaColor * 0.7, sigmaSpace * 0.7);
        } else {
            cv.GaussianBlur(temp, out, new cv.Size(5, 5), (sigmaColor * 0.7) / 50);
        }
        temp.delete();
    } catch (error) {
        if (!WARNED.bilateralFailed) {
            console.warn("ℹ️ Bilateral filter failed, using GaussianBlur fallback");
            WARNED.bilateralFailed = true;
        }
        if (typeof cv.bilateralFilter === 'function') {
            cv.bilateralFilter(bgr, out, d, sigmaColor, sigmaSpace);
        } else {
            cv.GaussianBlur(bgr, out, new cv.Size(Math.max(3, d | 1), Math.max(3, d | 1)), sigmaColor / 50);
        }
    }

    return out;
}

// Advanced noise reduction using Non-Local Means Denoising
function applyAdvancedDenoising(cv, bgr, h = 10, templateWindowSize = 7, searchWindowSize = 21) {
    const out = new cv.Mat();

    try {
        // Check if fastNlMeansDenoisingColored is available
        if (typeof cv.fastNlMeansDenoisingColored === "function") {
            cv.fastNlMeansDenoisingColored(bgr, out, h, h, templateWindowSize, searchWindowSize);
        } else {
            // Fallback to bilateral filter
            return applyBilateralFilter(cv, bgr, 9, 75, 75);
        }
    } catch (error) {
        console.warn("Advanced denoising failed, using bilateral:", error.message);
        return applyBilateralFilter(cv, bgr, 9, 75, 75);
    }

    return out;
}

// Wiener-like deconvolution for blur removal
function applyWienerDeconvolution(cv, bgr, kernelSize = 5, noiseVariance = 0.01) {
    const out = new cv.Mat();

    try {
        // Create motion blur kernel
        const kernel = cv.getRotationMatrix2D(new cv.Point2f(kernelSize / 2, kernelSize / 2), 0, 1);
        kernel.delete();

        // For now, use enhanced unsharp masking as approximation
        return applyUnsharpMask(cv, bgr, 2.5, 1.0, 0);
    } catch (error) {
        if (!WARNED.deconvolutionFailed) {
            console.warn("ℹ️ Deconvolution kernel unavailable in this build; using Unsharp Mask fallback");
            WARNED.deconvolutionFailed = true;
        }
        return applyUnsharpMask(cv, bgr, 2.0, 1.5, 0);
    }
}

// Enhanced edge-preserving smoothing
function applyEdgePreservingFilter(cv, bgr, flags = 1, sigmaS = 50, sigmaR = 0.4) {
    const out = new cv.Mat();

    try {
        // Check if edgePreservingFilter is available
        if (typeof cv.edgePreservingFilter === "function") {
            cv.edgePreservingFilter(bgr, out, flags, sigmaS, sigmaR);
        } else {
            // Fallback to bilateral filter
            return applyBilateralFilter(cv, bgr, 9, sigmaR * 100, sigmaS);
        }
    } catch (error) {
        console.warn("Edge preserving filter failed:", error.message);
        return applyBilateralFilter(cv, bgr, 9, 40, 50);
    }

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

// Enhanced augmentation pipeline focused on blur and noise recovery
async function generateAugmentedImageData(buffer) {
    const cv = await getCV();
    const imageData = await decodeToImageData(buffer);

    // Prepare list with original and geometric variants first (handle crops/rotations)
    const variants = [imageData];
    try {
        const geom = await generateGeometricVariants(buffer);
        for (const v of geom) variants.push(v);
    } catch (_) {}

    // If OpenCV is not ready, return geometric-only variants
    const cvReady = cv && typeof cv.Mat === 'function' && typeof cv.cvtColor === 'function';
    if (!cvReady) {
        if (!WARNED.opencvNotReady) {
            console.warn("ℹ️ OpenCV.js not initialized; using geometric-only variants");
            WARNED.opencvNotReady = true;
        }
        return variants;
    }

    // Original as BGR mat for further photometric enhancements
    const baseBGR = toBGRMat(cv, imageData);

    try {
        // 1. Original (baseline) already included; still push a CV-converted copy for parity
        variants.push(toImageDataFromBGR(cv, baseBGR));

        // 2. Enhanced CLAHE for better contrast
        const claheBGR = applyCLAHE(cv, baseBGR, 4.0, 6);
        variants.push(toImageDataFromBGR(cv, claheBGR));
        claheBGR.delete();

        // 3. Strong unsharp masking for blur recovery
        const sharpBGR = applyUnsharpMask(cv, baseBGR, 2.5, 1.2, 0);
        variants.push(toImageDataFromBGR(cv, sharpBGR));
        sharpBGR.delete();

        // 4. Mild unsharp masking (alternative)
        const mildSharpBGR = applyUnsharpMask(cv, baseBGR, 1.8, 0.8, 5);
        variants.push(toImageDataFromBGR(cv, mildSharpBGR));
        mildSharpBGR.delete();

        // 5. Advanced denoising for noise reduction
        const denoiseBGR = applyAdvancedDenoising(cv, baseBGR, 8, 7, 21);
        variants.push(toImageDataFromBGR(cv, denoiseBGR));
        denoiseBGR.delete();

        // 6. Edge-preserving smoothing
        const edgeBGR = applyEdgePreservingFilter(cv, baseBGR, 1, 40, 0.3);
        variants.push(toImageDataFromBGR(cv, edgeBGR));
        edgeBGR.delete();

        // 7. Bilateral filter (strong)
        const bilateralBGR = applyBilateralFilter(cv, baseBGR, 9, 80, 80);
        variants.push(toImageDataFromBGR(cv, bilateralBGR));
        bilateralBGR.delete();

        // 8. Wiener-like deconvolution for motion blur
        const deconvBGR = applyWienerDeconvolution(cv, baseBGR, 5, 0.01);
        variants.push(toImageDataFromBGR(cv, deconvBGR));
        deconvBGR.delete();

        // 9. Color temperature adjustment (cooler) - helps with color cast from blur
        const coolBGR = adjustColorTemperature(cv, baseBGR, -25);
        variants.push(toImageDataFromBGR(cv, coolBGR));
        coolBGR.delete();

        // 10. Color temperature adjustment (warmer)
        const warmBGR = adjustColorTemperature(cv, baseBGR, 25);
        variants.push(toImageDataFromBGR(cv, warmBGR));
        warmBGR.delete();

        // 11. Gamma correction for exposure (helps with blur from poor lighting)
        const gammaBGR = adjustGamma(cv, baseBGR, 1.3);
        variants.push(toImageDataFromBGR(cv, gammaBGR));
        gammaBGR.delete();

        // 12. HSV adjustments for color recovery
        const hsvBGR = adjustHSV(cv, baseBGR, 0, 1.15, 1.08);
        variants.push(toImageDataFromBGR(cv, hsvBGR));
        hsvBGR.delete();

        // 13. Global histogram equalization
        const histEqBGR = applyGlobalHistEq(cv, baseBGR);
        variants.push(toImageDataFromBGR(cv, histEqBGR));
        histEqBGR.delete();

        // 14-15. Brightness adjustments (for under/over exposed blurry images)
        const darkBGR = applyBrightness(cv, baseBGR, 0.8, -8);
        variants.push(toImageDataFromBGR(cv, darkBGR));
        darkBGR.delete();

        const brightBGR = applyBrightness(cv, baseBGR, 1.2, 12);
        variants.push(toImageDataFromBGR(cv, brightBGR));
        brightBGR.delete();
    } catch (error) {
        console.warn("Enhanced augmentation error:", error.message);
        // Return at least the original if augmentations fail
        if (variants.length === 0) {
            variants.push(toImageDataFromBGR(cv, baseBGR));
        }
    } finally {
        // Cleanup base mat
        baseBGR.delete();
    }

    // Limit to 18 variants to balance performance
    const limited = variants.slice(0, 18);
    console.log(`🎨 Generated ${limited.length} enhanced variants (geom + blur/noise focused)`);
    return limited;
}

module.exports = {
    generateAugmentedImageData,
    // Export individual functions for testing
    applyCLAHE,
    applyUnsharpMask,
    applyBilateralFilter,
    adjustColorTemperature,
    adjustGamma,
    adjustHSV,
    // For tests
    generateGeometricVariants,
    imageToImageData,
};
