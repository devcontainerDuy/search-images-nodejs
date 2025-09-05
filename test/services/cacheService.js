const { LRUCache } = require("../utils/lru");

// Cache for keyword list results (/api/search)
// - Small TTL to keep results fresh when content changes
// - Reasonable capacity to avoid memory blowup
const searchListCache = new LRUCache(500, 30_000); // 30s TTL

function makeSearchKey({ q = "", page = 1, limit = 20 }) {
    return `search:list:q=${q}|p=${page}|l=${limit}`;
}

module.exports = {
    searchListCache,
    makeSearchKey,
};
