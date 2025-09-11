const { pipeline, env, RawImage } = require("@xenova/transformers");
const fs = require("fs");
const path = require("path");
const { l2 } = require("../utils/clip");
const { generateAugmentedImageData, generateGridTiles } = require("../utils/augment");
const { generateSmartAugmentations, analyzeImageQuality } = require("../utils/smart-augment");

// Configure environment if needed (e.g., local model cache)
env.localModelPath = path.resolve(__dirname, "./cache");
env.allowLocalModels = true;
// Tune ONNX WebAssembly backend for better CPU utilization
try {
    const threads = parseInt(process.env.ONNX_NUM_THREADS || String(Math.max(2, Math.min(8, require('os').cpus().length))), 10);
    env.backends = env.backends || {};
    env.backends.onnx = env.backends.onnx || {};
    env.backends.onnx.wasm = env.backends.onnx.wasm || {};
    env.backends.onnx.wasm.numThreads = threads;
    env.backends.onnx.wasm.simd = true;
} catch (_) {}
// Ensure the local model cache directory exists (created at runtime)
try {
    if (!fs.existsSync(env.localModelPath)) {
        fs.mkdirSync(env.localModelPath, { recursive: true });
    }
} catch (e) {
    console.warn("⚠️ Unable to create local model cache dir:", env.localModelPath, e.message);
}

// Model selection based on performance (mirroring Python logic)
const getOptimalModel = () => {
    // Try to use larger model if GPU/high-end CPU is available
    // For now, we'll stick with base model for JavaScript compatibility
    const models = ["Xenova/clip-vit-base-patch32", "Xenova/clip-vit-base-patch16"];
    return process.env.CLIP_MODEL_ID || models[0];
};

const DEFAULT_MODEL_ID = getOptimalModel();

let extractorPromise = null;
let modelInfo = {
    name: DEFAULT_MODEL_ID,
    device: "wasm-cpu",
    loaded: false,
};

// Debug logging control for embedding steps
const DEBUG_EMBED = ["1", "true", "yes"].includes(String(process.env.EMBED_LOG || "").toLowerCase());
const elog = (...args) => { if (DEBUG_EMBED) console.log(...args); };

/**
 * Singleton pipeline để tránh khởi tạo lại nhiều lần.
 */
async function getExtractor() {
    if (!extractorPromise) {
        console.log(`🔄 Loading CLIP model: ${DEFAULT_MODEL_ID}...`);
        const startTime = Date.now();
        extractorPromise = pipeline("image-feature-extraction", DEFAULT_MODEL_ID)
            .then((pipe) => {
                const loadTime = (Date.now() - startTime) / 1000;
                console.log(`✅ CLIP model loaded in ${loadTime.toFixed(2)}s`);
                modelInfo.loaded = true;
                return pipe;
            })
            .catch((err) => {
                console.error(`❌ Failed to load CLIP model:`, err);
                extractorPromise = null;
                throw err;
            });
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
    // RawImage.fromImageData is not available in this version.
    // Construct a lightweight HWC tensor object for fromTensor.
    const { data: pixelData, width, height } = imageData;
    const channels = 4; // RGBA
    const tensor = { dims: [height, width, channels], data: pixelData };
    const raw = await RawImage.fromTensor(tensor, 'HWC');
    const out = await pipe(raw);
    const outputData = out?.data ?? (Array.isArray(out) ? out[0] : out);
    const vec = Float32Array.from(outputData);
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
 * Extract embedding with intelligent augmentation based on image analysis.
 * Automatically selects optimal augmentations for blurry images, color variations, etc.
 * @param {Buffer} buffer
 * @param {boolean} useAugment
 * @param {boolean} useSmartAugment - Use intelligent augmentation selection
 * @returns {Promise<Float32Array>}
 */
async function embedImageFromBufferWithAugment(buffer, useAugment = true, useSmartAugment = true, analysis = null) {
    if (!useAugment) return embedImageFromBuffer(buffer);

    try {
        // Use smart augmentation if enabled; avoid re-analyzing if analysis provided
        const variants = useSmartAugment ? await generateSmartAugmentations(buffer, analysis) : await generateAugmentedImageData(buffer);

        // Fallback to original buffer if augment fails
        if (variants.length === 0) {
            elog("⚠️ Augmentation failed, using original image");
            return embedImageFromBuffer(buffer);
        }

        // Embed variants with limited concurrency to reduce WASM contention
        elog(`🔄 Processing ${variants.length} augmented variants (smart: ${useSmartAugment})...`);
        const limit = Math.max(1, parseInt(process.env.EMBED_CONCURRENCY || '2', 10));
        const vecs = [];
        let i = 0;
        while (i < variants.length) {
            const slice = variants.slice(i, i + limit);
            const batch = await Promise.all(slice.map(img => embedImageFromImageData(img).catch(e => {
                console.warn("Skip augmented variant:", e.message);
                return null;
            })));
            for (const v of batch) if (v) vecs.push(v);
            i += limit;
        }

        // If all variants failed, fallback to original
        if (vecs.length === 0) {
            elog("⚠️ All augmentation variants failed, using original image");
            return embedImageFromBuffer(buffer);
        }

        // Mean pool the vectors (like Python version)
        const dim = vecs[0].length;
        const mean = new Float32Array(dim);
        for (const v of vecs) {
            if (v.length !== dim) continue;
            for (let i = 0; i < dim; i++) mean[i] += v[i];
        }
        const n = vecs.length;
        for (let i = 0; i < dim; i++) mean[i] /= n;
        l2(mean); // Re-normalize after averaging

        elog(`✅ Averaged ${n} augmented embeddings with enhanced processing`);
        return mean;
    } catch (err) {
        console.warn("Augmentation failed, fallback to original:", err.message);
        return embedImageFromBuffer(buffer);
    }
}

/**
 * Get comprehensive model information (mirrors Python /stats endpoint)
 */
function getModelInfo() {
    return {
        ...modelInfo,
        total_variants: 18, // Original + geometric (crop/flip/rotate) + photometric
        augmentation_types: [
            "original",
            "geom_center_crop_90",
            "geom_center_crop_70",
            "geom_top_left_crop_80",
            "geom_flip_horizontal",
            "geom_rotate_+8",
            "geom_rotate_-8",
            "enhanced_clahe_contrast",
            "strong_unsharp_deblur",
            "mild_unsharp_deblur",
            "advanced_nlm_denoising",
            "edge_preserving_filter",
            "bilateral_noise_reduction",
            "wiener_deconvolution",
            "color_temp_cool",
            "color_temp_warm",
            "gamma_correction",
            "hsv_adjustment",
            "histogram_equalization",
            "brightness_darker",
            "brightness_brighter",
        ],
        enhancement_features: [
            "multi_scale_blur_recovery",
            "motion_blur_detection",
            "advanced_noise_reduction",
            "edge_preserving_smoothing",
            "color_temperature_invariance",
            "contrast_enhancement",
            "exposure_normalization",
            "laplacian_sharpness_detection",
            "noise_variance_estimation",
            "geometric_crops_rotations_flips",
        ],
        blur_handling: {
            methods: ["unsharp_masking", "wiener_deconvolution", "edge_preserving"],
            motion_blur_detection: true,
            multi_scale_processing: true,
        },
        noise_handling: {
            methods: ["nlm_denoising", "bilateral_filter", "edge_preserving"],
            adaptive_parameters: true,
            noise_estimation: true,
        },
    };
}

/**
 * Process multiple images in batch with enhanced augmentation
 * @param {Array<{id: number, buffer: Buffer, filename: string}>} imageBatch
 * @param {boolean} useAugment
 * @param {boolean} useSmartAugment - Use intelligent augmentation
 * @returns {Promise<Array<{id: number, embedding: Float32Array, error?: string}>>}
 */
async function processBatchEmbeddings(imageBatch, useAugment = true, useSmartAugment = true) {
    const results = [];
    const startTime = Date.now();

    console.log(`🔄 Processing batch of ${imageBatch.length} images (smart augment: ${useSmartAugment})...`);

    for (let i = 0; i < imageBatch.length; i++) {
        const { id, buffer, filename } = imageBatch[i];
        try {
            const embedding = await embedImageFromBufferWithAugment(buffer, useAugment, useSmartAugment);
            results.push({ id, embedding });

            if ((i + 1) % 5 === 0) {
                const elapsed = (Date.now() - startTime) / 1000;
                const rate = (i + 1) / elapsed;
                console.log(`Processed ${i + 1}/${imageBatch.length} images (${rate.toFixed(2)} img/sec)`);
            }
        } catch (error) {
            console.warn(`❌ Failed to process ${filename}:`, error.message);
            results.push({ id, error: error.message });
        }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`✅ Enhanced batch completed in ${totalTime.toFixed(2)}s`);

    return results;
}

module.exports = {
    getExtractor,
    embedImageFromBuffer,
    embedImageFromImageData,
    embedImageFromPath,
    getModelId,
    embedImageFromBufferWithAugment,
    getModelInfo,
    processBatchEmbeddings,
};

/**
 * Embed grid tiles from a buffer and return an array of vectors.
 * @param {Buffer} buffer
 * @param {number} grid - number of tiles per side (e.g., 3, 5)
 * @returns {Promise<Float32Array[]>}
 */
async function embedImageGridTiles(buffer, grid = 3, overlap = 0) {
    const tiles = await generateGridTiles(buffer, { grid, maxTiles: grid * grid * (overlap > 0 ? 2 : 1), overlap });
    const out = [];
    for (const t of tiles) {
        try {
            const v = await embedImageFromImageData(t);
            out.push({ vec: v, rect: t.rect || { x: 0, y: 0, w: t.width, h: t.height } });
        } catch (_) {}
    }
    return out;
}

module.exports.embedImageGridTiles = embedImageGridTiles;
