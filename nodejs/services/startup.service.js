/**
 * Startup service to initialize the image search system
 * Mirrors Python's load_image_features() functionality
 */

const { getModelId, getModelInfo } = require("./clip.service");
const { getEmbeddingsWithImages } = require("../models/embeddings");

let isInitialized = false;
let initializationPromise = null;

/**
 * Initialize the system - load model and warm caches
 */
async function initializeSystem() {
    if (isInitialized) {
        console.log("✅ System already initialized");
        return;
    }

    if (initializationPromise) {
        console.log("🔄 System initialization in progress...");
        return initializationPromise;
    }

    initializationPromise = _performInitialization();
    return initializationPromise;
}

async function _performInitialization() {
    const startTime = Date.now();
    console.log("🚀 Initializing Image Search System...");

    try {
        // 1. Load and verify CLIP model
        console.log("🔄 Loading CLIP model...");
        const modelId = getModelId();
        const modelInfo = getModelInfo();
        console.log(`📊 Model: ${modelId}`);
        console.log(`🖥️  Device: ${modelInfo.device}`);

        // 2. Check database connectivity and embeddings
        console.log("🔄 Checking database embeddings...");
        const embeddings = await getEmbeddingsWithImages(modelId);
        console.log(`📊 Found ${embeddings.length} pre-computed embeddings`);

        // 3. System ready
        const initTime = (Date.now() - startTime) / 1000;
        console.log(`✅ System initialized successfully in ${initTime.toFixed(2)}s`);
        console.log(`🎯 Ready for image search operations`);
        
        isInitialized = true;
        initializationPromise = null;

        return {
            status: "success",
            model: modelId,
            embeddings_count: embeddings.length,
            initialization_time: initTime
        };

    } catch (error) {
        console.error("❌ System initialization failed:", error);
        initializationPromise = null;
        throw error;
    }
}

/**
 * Get system status
 */
function getSystemStatus() {
    return {
        initialized: isInitialized,
        initializing: !!initializationPromise,
        model: getModelId(),
        model_info: getModelInfo()
    };
}

/**
 * Reset initialization state (for testing)
 */
function resetInitialization() {
    isInitialized = false;
    initializationPromise = null;
    console.log("🔄 System initialization state reset");
}

module.exports = {
    initializeSystem,
    getSystemStatus,
    resetInitialization,
    get isInitialized() { return isInitialized; }
};
