// ============ OPTIMIZED API CLIENT ============
import { clientCache } from './cacheManager.js';
import { getSearchConfig } from './searchConfig.js';

class ApiClient {
    constructor() {
        this.baseURL = '';
        this.defaultHeaders = {
            'Content-Type': 'application/json',
        };
    }

    // Generic fetch với cache support
    async fetch(endpoint, options = {}, useCache = false) {
        const { method = 'GET', body, headers = {} } = options;
        
        // Cache key generation
        let cacheKey = null;
        if (useCache && method === 'GET') {
            cacheKey = `api:${endpoint}`;
            const cached = clientCache.get(cacheKey);
            if (cached) {
                console.log('🚀 Cache hit:', cacheKey);
                return { data: cached, fromCache: true };
            }
        }

        try {
            const response = await fetch(endpoint, {
                method,
                headers: { ...this.defaultHeaders, ...headers },
                body,
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            // Cache successful GET requests
            if (useCache && method === 'GET' && cacheKey) {
                clientCache.set(cacheKey, data);
            }

            return { data, fromCache: false };
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Keyword search với cache
    async searchKeywords({ q = "", page = 1, limit = 20 }) {
        const endpoint = `/api/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`;
        const cacheKey = clientCache.makeSearchKey({ q, page, limit });
        
        // Check cache first
        const cached = clientCache.get(cacheKey);
        if (cached) {
            console.log('🚀 Search cache hit:', cacheKey);
            return { data: cached, fromCache: true };
        }

        const result = await this.fetch(endpoint);
        
        // Cache keyword search results
        if (result.data && !result.fromCache) {
            clientCache.set(cacheKey, result.data);
        }

        return result;
    }

    // Image search (không cache vì file upload)
    async searchByImage(method, imageData) {
        const config = getSearchConfig(method);
        const endpoint = config.endpoint;

        let options = { method: 'POST' };
        
        if (imageData instanceof FormData) {
            // File upload
            options.body = imageData;
            delete options.headers; // Let browser set multipart boundary
        } else if (imageData.url) {
            // URL search
            options.body = JSON.stringify({ url: imageData.url });
        }

        return await this.fetch(endpoint, options, false);
    }

    // Similar images
    async findSimilarImages(imageId) {
        const endpoint = `/api/image/${imageId}/similar?threshold=16&topK=24`;
        return await this.fetch(endpoint, {}, false); // Không cache vì kết quả có thể thay đổi
    }

    // Upload image
    async uploadImage(formData) {
        return await this.fetch('/api/upload', {
            method: 'POST',
            body: formData,
        }, false);
    }

    // Delete image
    async deleteImage(imageId) {
        const result = await this.fetch(`/api/image/${imageId}`, {
            method: 'DELETE',
        }, false);

        // Clear related caches when image is deleted
        clientCache.deleteByPrefix('search:list:');
        
        return result;
    }
}

// Global API client instance
const apiClient = new ApiClient();

export { ApiClient, apiClient };
