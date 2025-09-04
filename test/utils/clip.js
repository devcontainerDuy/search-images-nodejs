// Utility for CLIP embeddings using @xenova/transformers
// Works in CommonJS via dynamic import.

const MODEL_ID = process.env.CLIP_MODEL_ID || "Xenova/clip-vit-base-patch32";

let extractorPromise = null;

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
            // Load CLIP feature extraction pipeline
            return pipeline("feature-extraction", MODEL_ID);
        })();
    }
    return extractorPromise;
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

    // pooling: 'mean' to get a single vector, normalize for cosine similarity
    const output = await extractor(image, { pooling: "mean", normalize: true });
    const vector = Array.from(output.data);
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
};
