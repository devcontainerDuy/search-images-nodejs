const { pipeline, env, RawImage } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");
const { l2 } = require("../utils/clip");

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

module.exports = { getExtractor, embedImageFromBuffer, embedImageFromPath, getModelId };
