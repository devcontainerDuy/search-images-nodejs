const { pipeline, env, RawImage } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");
const { l2 } = require("../utils/clip");
const { generateAugmentedImageData } = require("../utils/augment");

// Configure environment if needed (e.g., local model cache)
env.localModelPath = path.resolve(__dirname, "./cache");
env.allowLocalModels = true;

// Default CLIP model (similar to ViT-B/32 in Python fallback)
const DEFAULT_MODEL_ID = process.env.CLIP_MODEL_ID || "Xenova/clip-vit-base-patch32";

let extractorPromise = null;

/**
 * Singleton pipeline để tránh khởi tạo lại nhiều lần.
 */
async function getExtractor() {
    if (!extractorPromise) {
        extractorPromise = pipeline("image-feature-extraction", DEFAULT_MODEL_ID);
    }
    return extractorPromise;
}

/**
 * Trích xuất embedding từ buffer ảnh (robust decoding qua RawImage).
 * @param {Buffer} buffer
 * @returns {Promise<Float32Array>} vector đã L2-normalize
 */
async function embedImageFromBuffer(buffer) {
    const pipe = await getExtractor();
    // Use RawImage for robust decoding in Node
    const BlobCtor = globalThis.Blob || require("buffer").Blob;
    const image = await RawImage.fromBlob(new BlobCtor([buffer]));
    const out = await pipe(image);
    const data = out?.data ?? (Array.isArray(out) ? out[0] : out);
    const vec = Float32Array.from(data);
    l2(vec);
    return vec;
}

/**
 * Embed from ImageData-like object (Uint8ClampedArray RGBA, width, height)
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imageData
 */
async function embedImageFromImageData(imageData) {
    const pipe = await getExtractor();
    const raw = await RawImage.fromImageData(imageData);
    const out = await pipe(raw);
    const data = out?.data ?? (Array.isArray(out) ? out[0] : out);
    const vec = Float32Array.from(data);
    l2(vec);
    return vec;
}

/**
 * Trích xuất embedding từ file path.
 * @param {string} filePath
 * @returns {Promise<Float32Array>} vector đã L2-normalize
 */
async function embedImageFromPath(filePath) {
    const pipe = await getExtractor();
    const out = await pipe(filePath);
    const data = out?.data ?? (Array.isArray(out) ? out[0] : out);
    const vec = Float32Array.from(data);
    l2(vec);
    return vec;
}

/**
 * Lấy model id đang dùng (hữu ích cho /stats).
 */
function getModelId() {
    return DEFAULT_MODEL_ID;
}

/**
 * Extract embedding with optional simple augmentations and average the vectors.
 * Mirrors Python's augmentation-mean strategy at a simpler level.
 * @param {Buffer} buffer
 * @param {boolean} useAugment
 * @returns {Promise<Float32Array>}
 */
async function embedImageFromBufferWithAugment(buffer, useAugment = true) {
    if (!useAugment) return embedImageFromBuffer(buffer);

    // Generate ImageData variants via OpenCV pipeline
    const variants = await generateAugmentedImageData(buffer).catch(() => []);
    const vecs = [];
    if (variants.length) {
        for (const img of variants) {
            try {
                const v = await embedImageFromImageData(img);
                vecs.push(v);
            } catch (_) {}
        }
    }
    // Fallback to original buffer if augment fails
    if (vecs.length === 0) return embedImageFromBuffer(buffer);

    // Mean pool
    const dim = vecs[0].length;
    const mean = new Float32Array(dim);
    for (const v of vecs) {
        if (v.length !== dim) continue;
        for (let i = 0; i < dim; i++) mean[i] += v[i];
    }
    const n = vecs.length;
    for (let i = 0; i < dim; i++) mean[i] /= n;
    l2(mean);
    return mean;
}

module.exports = { getExtractor, embedImageFromBuffer, embedImageFromImageData, embedImageFromPath, getModelId, embedImageFromBufferWithAugment };
