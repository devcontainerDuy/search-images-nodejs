// Enhanced OpenCV-based augmentations for robust image search
// Handles blurry images, color variations, lighting conditions
// Returns ImageData-like objects for @xenova/transformers

const I = require("image-js");
const imageType = require("image-type");

// Env-driven safety knobs
const AUGMENT_ENABLE_CV = !["0","false","no"].includes(String(process.env.AUGMENT_ENABLE_CV || "true").toLowerCase());
const AUGMENT_MAX_PIXELS = parseInt(process.env.AUGMENT_MAX_PIXELS || String(3_200_000), 10); // ~3.2MP

// minimize repeated warnings
let WARNED = {
    opencvNotReady: false,
    bilateralMissing: false,
    bilateralFailed: false,
    deconvolutionFailed: false,
};
// Runtime circuit breaker: if WASM throws OOB once, disable CV aug thereafter
let DISABLE_CV_RUNTIME = false;
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
    const type = imageType(buffer);
    if (type && type.mime === 'image/webp') {
        // image-js may not support webp in this build; signal caller to fallback
        throw new Error('unsupported format: image/webp');
    }
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

// Generate grid tiles (N x N) as ImageData-like objects
// opts: { grid?: number (default 3), maxTiles?: number, overlap?: number (0..0.9) }
async function generateGridTiles(buffer, opts = {}) {
    const grid = Math.max(1, parseInt(opts.grid || 3, 10));
    const maxTiles = parseInt(opts.maxTiles || grid * grid, 10);
    const overlap = Math.min(0.9, Math.max(0, Number.isFinite(opts.overlap) ? opts.overlap : 0));
    const img = await I.decode(buffer);
    const { width, height } = img;

    const tiles = [];
    const tileW = Math.max(1, Math.floor(width / grid));
    const tileH = Math.max(1, Math.floor(height / grid));
    const strideW = Math.max(1, Math.floor(tileW * (1 - overlap)));
    const strideH = Math.max(1, Math.floor(tileH * (1 - overlap)));

    for (let y = 0; y < height && tiles.length < maxTiles; y += strideH) {
        for (let x = 0; x < width && tiles.length < maxTiles; x += strideW) {
            const w = x + tileW >= width ? width - x : tileW;
            const h = y + tileH >= height ? height - y : tileH;
            if (w <= 0 || h <= 0) continue;
            try {
                const tile = img.crop({ x, y, width: w, height: h });
                const idata = imageToImageData(tile);
                // attach rect for downstream usage (e.g., region embeddings)
                idata.rect = { x, y, w, h };
                tiles.push(idata);
            } catch (_) {}
        }
    }
    return tiles;
}

async function generateGeometricVariants(buffer, opts = {}) {
    const robust = !!opts.robust;
    const type = imageType(buffer);
    if (type && type.mime === 'image/webp') return [];
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

        if (robust) {
            // Additional crops for occlusions/partial contents
            const w3 = Math.max(1, Math.floor(width * 0.8));
            const h3 = Math.max(1, Math.floor(height * 0.8));
            // Bottom-right crop 80%
            variants.push(imageToImageData(img.crop({ x: width - w3, y: height - h3, width: w3, height: h3 })));
            // Center crop 50%
            const w4 = Math.max(1, Math.floor(width * 0.5));
            const h4 = Math.max(1, Math.floor(height * 0.5));
            const x4 = Math.floor((width - w4) / 2);
            const y4 = Math.floor((height - h4) / 2);
            variants.push(imageToImageData(img.crop({ x: x4, y: y4, width: w4, height: h4 })));
            // Extra small rotations
            try { variants.push(imageToImageData(img.rotate(12))); } catch(_) {}
            try { variants.push(imageToImageData(img.rotate(-12))); } catch(_) {}
        }
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

// Stable Unsharp Mask using addWeighted (avoids multi-channel threshold issues)
function applyUnsharpMask(cv, bgr, amount = 1.8, sigma = 1.0) {
    try {
        const blurred = new cv.Mat();
        const ksize = Math.max(3, (Math.round(sigma * 6) | 1)); // ensure odd
        cv.GaussianBlur(bgr, blurred, new cv.Size(ksize, ksize), sigma, sigma, cv.BORDER_DEFAULT);

        // out = (1 + amount) * bgr + (-amount) * blurred
        const out = new cv.Mat();
        cv.addWeighted(bgr, 1 + amount, blurred, -amount, 0, out);
        blurred.delete();
        return out;
    } catch (error) {
        console.warn("Unsharp mask failed:", error.message);
        return bgr.clone();
    }
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
        return applyUnsharpMask(cv, bgr, 2.0, 1.0);
    } catch (error) {
        if (!WARNED.deconvolutionFailed) {
            console.warn("ℹ️ Deconvolution kernel unavailable in this build; using Unsharp Mask fallback");
            WARNED.deconvolutionFailed = true;
        }
        return applyUnsharpMask(cv, bgr, 1.8, 1.2);
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

// Debug logging control for augment (disabled by default)
const DEBUG_AUGMENT = ["1", "true", "yes"].includes(String(process.env.AUGMENT_LOG || "").toLowerCase());
const alog = (...args) => { if (DEBUG_AUGMENT) console.log(...args); };

// Enhanced augmentation pipeline focused on blur and noise recovery
// opts: { maxVariants?: number, robust?: boolean }
async function generateAugmentedImageData(buffer, opts = {}) {
    const maxVariants = Math.max(1, Math.min(24, parseInt(opts.maxVariants || 18, 10)));
    const robust = !!opts.robust;
    const cv = await getCV();
    // If format unsupported (e.g., webp), skip augmentation gracefully
    try {
        var imageData = await decodeToImageData(buffer);
    } catch (e) {
        alog('augment: decode skipped ->', e.message);
        return [];
    }

    // Prepare list with original and geometric variants first (handle crops/rotations)
    const variants = [imageData];
    try {
        const geom = await generateGeometricVariants(buffer, { robust });
        for (const v of geom) {
            if (variants.length >= maxVariants) break;
            variants.push(v);
        }
    } catch (_) {}

    // Early exit if CV disabled by env, image too large, or OpenCV not ready
    const cvReady = cv && typeof cv.Mat === 'function' && typeof cv.cvtColor === 'function';
    if (DISABLE_CV_RUNTIME || !AUGMENT_ENABLE_CV || !cvReady || (imageData.width * imageData.height) > AUGMENT_MAX_PIXELS) {
        if (!WARNED.opencvNotReady) {
            const reason = DISABLE_CV_RUNTIME ? 'disabled (runtime error)' : (!AUGMENT_ENABLE_CV ? 'disabled by env' : (!cvReady ? 'not initialized' : 'image too large'));
            console.warn(`ℹ️ OpenCV.js ${reason}; using geometric-only variants`);
            WARNED.opencvNotReady = true;
        }
        return variants.slice(0, maxVariants);
    }

    // Original as BGR mat for further photometric enhancements
    const baseBGR = toBGRMat(cv, imageData);

    try {
        // 1. Original (baseline) already included; still push a CV-converted copy for parity
        if (variants.length < maxVariants) variants.push(toImageDataFromBGR(cv, baseBGR));

        // 2. Enhanced CLAHE for better contrast
        if (variants.length < maxVariants) {
            try {
                const claheBGR = applyCLAHE(cv, baseBGR, 4.0, 6);
                variants.push(toImageDataFromBGR(cv, claheBGR));
                claheBGR.delete();
            } catch (e) { alog('CLAHE failed:', e.message); }
        }

        // 3. Strong unsharp masking for blur recovery
        if (variants.length < maxVariants) {
            try { const sharpBGR = applyUnsharpMask(cv, baseBGR, 2.2, 1.2); variants.push(toImageDataFromBGR(cv, sharpBGR)); sharpBGR.delete(); } catch(e) { alog('Unsharp strong failed:', e.message); }
        }

        // 4. Mild unsharp masking (alternative)
        if (variants.length < maxVariants) {
            try { const mildSharpBGR = applyUnsharpMask(cv, baseBGR, 1.4, 0.8); variants.push(toImageDataFromBGR(cv, mildSharpBGR)); mildSharpBGR.delete(); } catch(e) { alog('Unsharp mild failed:', e.message); }
        }

        // 5. Advanced denoising for noise reduction
        if (variants.length < maxVariants) {
            try { const denoiseBGR = applyAdvancedDenoising(cv, baseBGR, 8, 7, 21); variants.push(toImageDataFromBGR(cv, denoiseBGR)); denoiseBGR.delete(); } catch(e) { alog('Denoise failed:', e.message); }
        }

        // 6. Edge-preserving smoothing
        if (variants.length < maxVariants) {
            try { const edgeBGR = applyEdgePreservingFilter(cv, baseBGR, 1, 40, 0.3); variants.push(toImageDataFromBGR(cv, edgeBGR)); edgeBGR.delete(); } catch(e) { alog('Edge-preserving failed:', e.message); }
        }

        // 7. Bilateral filter (strong)
        if (variants.length < maxVariants) {
            try { const bilateralBGR = applyBilateralFilter(cv, baseBGR, 9, 80, 80); variants.push(toImageDataFromBGR(cv, bilateralBGR)); bilateralBGR.delete(); } catch(e) { alog('Bilateral failed:', e.message); }
        }

        // 8. Wiener-like deconvolution for motion blur
        if (variants.length < maxVariants) {
            try { const deconvBGR = applyWienerDeconvolution(cv, baseBGR, 5, 0.01); variants.push(toImageDataFromBGR(cv, deconvBGR)); deconvBGR.delete(); } catch(e) { alog('Deconvolution failed:', e.message); }
        }

        // 9. Color temperature adjustment (cooler) - helps with color cast from blur
        if (variants.length < maxVariants) {
            try { const coolBGR = adjustColorTemperature(cv, baseBGR, -25); variants.push(toImageDataFromBGR(cv, coolBGR)); coolBGR.delete(); } catch(e) { alog('Color temp cool failed:', e.message); }
        }

        // 10. Color temperature adjustment (warmer)
        if (variants.length < maxVariants) {
            try { const warmBGR = adjustColorTemperature(cv, baseBGR, 25); variants.push(toImageDataFromBGR(cv, warmBGR)); warmBGR.delete(); } catch(e) { alog('Color temp warm failed:', e.message); }
        }

        // 11. Gamma correction for exposure (helps with blur from poor lighting)
        if (variants.length < maxVariants) {
            try { const gammaBGR = adjustGamma(cv, baseBGR, 1.3); variants.push(toImageDataFromBGR(cv, gammaBGR)); gammaBGR.delete(); } catch(e) { alog('Gamma failed:', e.message); }
        }

        // 12. HSV adjustments for color recovery
        if (variants.length < maxVariants) {
            try { const hsvBGR = adjustHSV(cv, baseBGR, 0, 1.15, 1.08); variants.push(toImageDataFromBGR(cv, hsvBGR)); hsvBGR.delete(); } catch(e) { alog('HSV failed:', e.message); }
        }

        // 13. Global histogram equalization
        if (variants.length < maxVariants) {
            try { const histEqBGR = applyGlobalHistEq(cv, baseBGR); variants.push(toImageDataFromBGR(cv, histEqBGR)); histEqBGR.delete(); } catch(e) { alog('HistEq failed:', e.message); }
        }

        // 14-15. Brightness adjustments (for under/over exposed blurry images)
        if (variants.length < maxVariants) {
            try { const darkBGR = applyBrightness(cv, baseBGR, 0.8, -8); variants.push(toImageDataFromBGR(cv, darkBGR)); darkBGR.delete(); } catch(e) { alog('Brightness dark failed:', e.message); }
        }

        if (variants.length < maxVariants) {
            try { const brightBGR = applyBrightness(cv, baseBGR, 1.2, 12); variants.push(toImageDataFromBGR(cv, brightBGR)); brightBGR.delete(); } catch(e) { alog('Brightness bright failed:', e.message); }
        }

        // 16. Optional upscale + sharpen (approximate SR) for low-res/motion blur
        if (robust && variants.length < maxVariants) {
            try {
                const up = new cv.Mat();
                cv.resize(baseBGR, up, new cv.Size(0, 0), 1.5, 1.5, cv.INTER_LANCZOS4);
                const upSharp = applyUnsharpMask(cv, up, 1.7, 1.0);
                variants.push(toImageDataFromBGR(cv, upSharp));
                upSharp.delete();
                up.delete();
            } catch(e) { alog('Upscale+sharp failed:', e.message); }
        }

        // 17. Median filter to reduce blocky artifacts
        if (robust && variants.length < maxVariants) {
            try { const med = new cv.Mat(); cv.medianBlur(baseBGR, med, 3); variants.push(toImageDataFromBGR(cv, med)); med.delete(); } catch(e) { alog('Median blur failed:', e.message); }
        }

        // 18. Super-sharpen for very blurry images
        if (robust && variants.length < maxVariants) {
            try { const superSharp = applyUnsharpMask(cv, baseBGR, 3.0, 2.0); variants.push(toImageDataFromBGR(cv, superSharp)); superSharp.delete(); } catch(e) { alog('Super-sharp failed:', e.message); }
        }

        // 19. High-contrast CLAHE for poor lighting
        if (robust && variants.length < maxVariants) {
            try { const highContrast = applyCLAHE(cv, baseBGR, 8.0, 8); variants.push(toImageDataFromBGR(cv, highContrast)); highContrast.delete(); } catch(e) { alog('High-contrast CLAHE failed:', e.message); }
        }
    } catch (error) {
        const msg = String(error && error.message || error);
        if (/memory access out of bounds|out of memory/i.test(msg)) {
            DISABLE_CV_RUNTIME = true;
        }
        // Log once if not already warned; otherwise keep quiet to avoid spam
        if (!WARNED.opencvNotReady) {
            console.warn("Enhanced augmentation error:", msg);
        }
        // Return at least the original if augmentations fail
        if (variants.length === 0) {
            variants.push(toImageDataFromBGR(cv, baseBGR));
        }
    } finally {
        // Cleanup base mat
        baseBGR.delete();
    }

    // Limit variants to balance performance
    const limited = variants.slice(0, maxVariants);
    alog(`🎨 Generated ${limited.length}/${variants.length} variants (max=${maxVariants})`);
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
    generateGridTiles,
};
