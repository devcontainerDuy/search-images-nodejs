class LRUCache {
    constructor(maxEntries = 500, ttlMs = 60_000) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
        this.map = new Map(); // key -> { value, expiresAt }
    }

    _now() {
        return Date.now();
    }

    _isExpired(entry) {
        return entry && entry.expiresAt && entry.expiresAt <= this._now();
    }

    get(key) {
        if (!this.map.has(key)) return undefined;
        const entry = this.map.get(key);
        if (this._isExpired(entry)) {
            this.map.delete(key);
            return undefined;
        }
        // refresh LRU order
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.value;
    }

    set(key, value, ttlMs) {
        const expiresAt = this._now() + (Number.isFinite(ttlMs) ? ttlMs : this.ttlMs);
        if (this.map.has(key)) this.map.delete(key);
        this.map.set(key, { value, expiresAt });
        // evict LRU
        while (this.map.size > this.maxEntries) {
            const oldestKey = this.map.keys().next().value;
            this.map.delete(oldestKey);
        }
    }

    delete(key) {
        this.map.delete(key);
    }

    clear() {
        this.map.clear();
    }

    deleteByPrefix(prefix) {
        for (const k of this.map.keys()) {
            if (k.startsWith(prefix)) this.map.delete(k);
        }
    }
}

module.exports = { LRUCache };
