// ============ SEARCH METHOD CONFIGURATION ============
const SEARCH_CONFIG = {
    clip: {
        endpoint: "/api/search-by-image?method=clip&minSim=0.25&topK=24",
        displayMethod: "clip",
        cacheable: false, // Image search không cache
    },
    auto: {
        endpoint: "/api/search-by-image?method=clip&minSim=0.25&topK=24",
        displayMethod: "clip",
        cacheable: false,
    },
    color: {
        endpoint: "/api/search-by-image?method=color&topK=24",
        displayMethod: "color",
        cacheable: false,
    },
    hash: {
        endpoint: "/api/search-by-image?threshold=16&topK=24",
        displayMethod: "hash",
        cacheable: false,
    },
};

// Helper function to get search configuration
function getSearchConfig(method) {
    return SEARCH_CONFIG[method] || SEARCH_CONFIG.hash;
}

// API endpoint helpers
const API_ENDPOINTS = {
    upload: "/api/upload",
    search: "/api/search",
    searchByImage: "/api/search-by-image",
    similar: (id) => `/api/image/${id}/similar?threshold=16&topK=24`,
    deleteImage: (id) => `/api/image/${id}`,
};

export { SEARCH_CONFIG, getSearchConfig, API_ENDPOINTS };
