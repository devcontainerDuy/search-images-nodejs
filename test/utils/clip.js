// Utility for CLIP embeddings using @xenova/transformers
// Works in CommonJS via dynamic import.

const MODEL_ID = process.env.CLIP_MODEL_ID || "Xenova/clip-vit-base-patch32";

let extractorPromise = null;
let textExtractorPromise = null;

async function getExtractor() {
    if (!extractorPromise) {
        extractorPromise = (async () => {
            const mod = await import("@xenova/transformers");
            const { pipeline, env } = mod;
            // Optional: allow caching locally
            if (process.env.TRANSFORMERS_CACHE) {
                env.cacheDir = process.env.TRANSFORMERS_CACHE;
            }
            env.allowLocalModels = true;
            // Load CLIP image feature extraction pipeline (image tower)
            return pipeline("image-feature-extraction", MODEL_ID);
        })();
    }
    return extractorPromise;
}

async function getTextExtractor() {
    if (!textExtractorPromise) {
        textExtractorPromise = (async () => {
            const mod = await import("@xenova/transformers");
            const { pipeline, env } = mod;
            if (process.env.TRANSFORMERS_CACHE) {
                env.cacheDir = process.env.TRANSFORMERS_CACHE;
            }
            env.allowLocalModels = true;
            // CLIP text tower
            return pipeline("feature-extraction", MODEL_ID);
        })();
    }
    return textExtractorPromise;
}

async function computeClipEmbedding(input) {
    const mod = await import("@xenova/transformers");
    const { RawImage } = mod;
    const extractor = await getExtractor();

    let image;
    if (Buffer.isBuffer(input)) {
        // Node.js: construct a Blob from Buffer, then decode via RawImage
        const NodeBlob = globalThis.Blob || require("buffer").Blob;
        image = await RawImage.fromBlob(new NodeBlob([input]));
    } else if (typeof input === "string") {
        // Local file path or URL
        image = await RawImage.read(input);
    } else {
        throw new Error("Unsupported input for computeClipEmbedding");
    }

    // Compute image embedding tensor and L2-normalize
    const output = await extractor(image);
    const vector = Array.from(output.data);
    let norm = 0; for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm);
    if (norm > 0) { for (let i = 0; i < vector.length; i++) vector[i] /= norm; }
    return vector;
}

function cosineSimilarity(vecA, vecB) {
    const len = Math.min(vecA.length, vecB.length);
    let dot = 0;
    let a2 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
        const a = vecA[i];
        const b = vecB[i];
        dot += a * b;
        a2 += a * a;
        b2 += b * b;
    }
    if (a2 === 0 || b2 === 0) return 0;
    return dot / Math.sqrt(a2 * b2);
}

module.exports = {
    MODEL_ID,
    computeClipEmbedding,
    cosineSimilarity,
    // Optional: compute CLIP text embedding for text-to-image search
    computeClipTextEmbedding: async function (text) {
        if (typeof text !== 'string') throw new Error('Text must be a string');
        const extractor = await getTextExtractor();
        const output = await extractor(text, { pooling: 'mean' });
        const arr = Array.from(output.data);
        let norm = 0; for (let i = 0; i < arr.length; i++) norm += arr[i] * arr[i];
        norm = Math.sqrt(norm); if (norm > 0) { for (let i = 0; i < arr.length; i++) arr[i] /= norm; }
        return arr;
    },
};
