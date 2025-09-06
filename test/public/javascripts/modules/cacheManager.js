// ============ CLIENT-SIDE CACHE MANAGER ============
// Tích hợp với backend cache service để tránh duplicate logic

class ClientCacheManager {
    constructor() {
        this.cache = new Map();
        this.CACHE_TTL = 30 * 1000; // 30s giống backend searchListCache
        this.MAX_ENTRIES = 100; // Giới hạn memory usage
    }

    // Tạo cache key theo format backend (makeSearchKey)
    makeSearchKey({ q = "", page = 1, limit = 20 }) {
        return `search:list:q=${q}|p=${page}|l=${limit}`;
    }

    // Image search cache key (không cache vì file upload)
    makeImageSearchKey(method, timestamp = Date.now()) {
        return `image:search:${method}:${timestamp}`;
    }

    get(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        if (Date.now() - cached.timestamp > this.CACHE_TTL) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    set(key, data) {
        // LRU eviction
        if (this.cache.size >= this.MAX_ENTRIES) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
        });
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    // Xóa cache theo prefix (tương tự backend deleteByPrefix)
    deleteByPrefix(prefix) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }

    // Cache statistics for debugging
    getStats() {
        return {
            size: this.cache.size,
            maxEntries: this.MAX_ENTRIES,
            ttl: this.CACHE_TTL,
        };
    }
}

// Global cache instance
const clientCache = new ClientCacheManager();

export { ClientCacheManager, clientCache };
