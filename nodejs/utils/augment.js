// OpenCV-based augmentations to mirror Python: CLAHE, histogram equalization,
// Gaussian blur, brightness adjustments. Returns ImageData-like objects that
// can be consumed by RawImage.fromImageData in @xenova/transformers.

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

function applyCLAHE(cv, bgr) {
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

function applyGaussianBlur(cv, bgr) {
    const out = new cv.Mat();
    const ksize = new cv.Size(3, 3);
    cv.GaussianBlur(bgr, out, ksize, 0, 0, cv.BORDER_DEFAULT);
    return out;
}

function applyBrightness(cv, bgr, alpha, beta) {
    const out = new cv.Mat();
    cv.convertScaleAbs(bgr, out, alpha, beta);
    return out;
}

async function generateAugmentedImageData(buffer) {
    const cv = await getCV();
    const imageData = await decodeToImageData(buffer);

    // Original
    const baseBGR = toBGRMat(cv, imageData);

    // 1. CLAHE
    const claheBGR = applyCLAHE(cv, baseBGR);

    // 2. Global histogram equalization (Y channel)
    const histEqBGR = applyGlobalHistEq(cv, baseBGR);

    // 3. Gaussian blur (3x3)
    const blurBGR = applyGaussianBlur(cv, baseBGR);

    // 4. Darker (alpha 0.9)
    const darkBGR = applyBrightness(cv, baseBGR, 0.9, 0);

    // 5. Brighter (alpha 1.1, beta 10)
    const brightBGR = applyBrightness(cv, baseBGR, 1.1, 10);

    // Convert all to RGBA ImageData-like objects
    const variants = [toImageDataFromBGR(cv, baseBGR), toImageDataFromBGR(cv, claheBGR), toImageDataFromBGR(cv, histEqBGR), toImageDataFromBGR(cv, blurBGR), toImageDataFromBGR(cv, darkBGR), toImageDataFromBGR(cv, brightBGR)];

    // Cleanup mats
    baseBGR.delete();
    claheBGR.delete();
    histEqBGR.delete();
    blurBGR.delete();
    darkBGR.delete();
    brightBGR.delete();

    return variants;
}

module.exports = { generateAugmentedImageData };
