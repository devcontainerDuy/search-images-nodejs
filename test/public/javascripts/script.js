// ============ OPTIMIZED SEARCH APP ============
// Tích hợp với backend cache service

class ClientCache {
    constructor() {
        this.cache = new Map();
        this.CACHE_TTL = 30 * 1000; // 30s giống backend
        this.MAX_ENTRIES = 100;
    }

    makeSearchKey({ q = "", page = 1, limit = 20 }) {
        return `search:list:q=${q}|p=${page}|l=${limit}`;
    }

    get(key) {
        const cached = this.cache.get(key);
        if (!cached || Date.now() - cached.timestamp > this.CACHE_TTL) {
            this.cache.delete(key);
            return null;
        }
        return cached.data;
    }

    set(key, data) {
        if (this.cache.size >= this.MAX_ENTRIES) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    deleteByPrefix(prefix) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) this.cache.delete(key);
        }
    }

    getStats() {
        return { size: this.cache.size, maxEntries: this.MAX_ENTRIES, ttl: this.CACHE_TTL + "ms" };
    }
}

// Global instances
const clientCache = new ClientCache();

// Config
const SEARCH_ENDPOINTS = {
    clip: () => "/api/search-by-image?method=clip&minSim=0.25&topK=24",
    auto: () => "/api/search-by-image?method=clip&minSim=0.25&topK=24",
    full: () => {
        const combine = (document.getElementById("combine")?.value || "lexi").toLowerCase();
        const restrict = document.getElementById("restrictToClip")?.checked ? "1" : "0";
        const colorVariant = (document.getElementById("colorVariant")?.value || "multi").toLowerCase();
        const lexiEps = Number(document.getElementById("lexiEps")?.value || 0.02);
        const params = new URLSearchParams({ method: "full", topK: "24", minSim: "0.25", combine, restrictToClip: restrict, colorVariant, lexiEps: String(lexiEps) });
        return "/api/search-by-image?" + params.toString();
    },
    color: () => "/api/search-by-image?method=color&topK=24",
    hash: () => "/api/search-by-image?threshold=16&topK=24",
};

// Utilities
function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// DOM cache
const elements = {
    uploadForm: document.getElementById("uploadForm"),
    uploadBtn: document.getElementById("uploadBtn"),
    uploadMsg: document.getElementById("uploadMsg"),
    results: document.getElementById("results"),
    resultsInfo: document.getElementById("resultsInfo"),
    pagination: document.getElementById("pagination"),
    unifiedForm: document.getElementById("unifiedSearch"),
    methodSelect: document.getElementById("method"),
    combineSelect: document.getElementById("combine"),
    restrictToClip: document.getElementById("restrictToClip"),
    colorVariant: document.getElementById("colorVariant"),
    lexiEps: document.getElementById("lexiEps"),
    imageInput: document.getElementById("imageInputUnified"),
    imgUrl: document.getElementById("imgUrlUnified"),
    cameraBtn: document.getElementById("cameraBtnUnified"),
    queryPath: document.getElementById("queryPath"),
    previewCard: document.getElementById("previewCard"),
    queryInput: document.getElementById("q"),
    advancedOpts: document.getElementById("advancedOpts"),
};

// State
let currentQuery = "";
let currentPage = 1;
const currentLimit = 20;

// Render functions
function renderImages(list, meta = {}) {
    elements.results.innerHTML = "";

    if (!list?.length) {
        elements.results.innerHTML = '<div class="no-results">Không có kết quả</div>';
        return;
    }

    const fragment = document.createDocumentFragment();

    list.forEach((img) => {
        let footer = "";
        if (meta.method === "clip") {
            footer = `Cosine: ${Number(img.similarity ?? 0).toFixed(3)}`;
        } else if (meta.method === "full") {
            const parts = [];
            if (img.score != null) parts.push(`Score: ${Number(img.score).toFixed(3)}`);
            if (img.clipSimilarity != null) parts.push(`CLIP: ${Number(img.clipSimilarity).toFixed(3)}`);
            if (img.colorDistance != null) parts.push(`Color: ${Number(img.colorDistance).toFixed(3)}`);
            if (img.hashDistance != null) parts.push(`Hash: ${img.hashDistance}`);
            footer = parts.join(" • ");
        } else if (img.distance != null) {
            footer = `Hamming: ${img.distance} • Sim: ${Math.round((img.similarity || 0) * 100)}%`;
        }

        const idTag = img.imageId || img.id;
        const el = document.createElement("div");
        el.className = "item";
        const fname = img.filename;
        const src = fname ? `/uploads/thumbs/640/${fname}` : img.thumbnail || img.url || "";
        const srcset = fname ? `/uploads/thumbs/320/${fname} 320w, /uploads/thumbs/640/${fname} 640w, /uploads/images/${fname} 1280w` : "";
        const sizes = "(max-width: 600px) 50vw, (max-width: 900px) 33vw, 240px";
        el.innerHTML = `
            <img src="${src}"
                 ${srcset ? `srcset="${srcset}" sizes="${sizes}"` : ""}
                 onerror="this.onerror=null; this.removeAttribute('srcset'); this.removeAttribute('sizes'); this.src='${img.url || (fname ? `/uploads/images/${fname}` : "")}';"
                 alt="${img.title || "Ảnh"}"
                 loading="lazy" decoding="async" fetchpriority="low" />
            <div class="meta">
                <div class="tag">#${idTag}</div>
                ${img.title || ""}
                ${footer ? `<div class="muted">${footer}</div>` : ""}
                <div class="flex" style="margin-top:6px">
                    <button data-id="${idTag}" class="similar-btn">Tìm tương tự</button>
                    <button data-id="${idTag}" class="delete-btn btn btn-danger">Xóa</button>
                </div>
            </div>
        `;
        fragment.appendChild(el);
    });

    elements.results.appendChild(fragment);
    // Kích hoạt perf-lite nếu quá nhiều item để giữ FPS mượt
    try {
        const count = list.length;
        if (count >= 48) {
            document.body.classList.add("perf-lite");
        } else {
            document.body.classList.remove("perf-lite");
        }
    } catch (_) {}
}

function attachEventHandlers() {
    /* no-op: replaced by event delegation for performance */
}

function renderPagination(pagination) {
    if (!pagination?.pages || pagination.pages <= 1) {
        elements.pagination.innerHTML = "";
        return;
    }

    const { current, pages } = pagination;
    const parts = [];

    if (current > 1) parts.push(`<button class="page-btn" data-page="${current - 1}">‹</button>`);

    const start = Math.max(1, current - 2);
    const end = Math.min(pages, current + 2);

    for (let i = start; i <= end; i++) {
        parts.push(`<button class="page-btn ${i === current ? "active" : ""}" data-page="${i}">${i}</button>`);
    }

    if (current < pages) parts.push(`<button class="page-btn" data-page="${current + 1}">›</button>`);

    elements.pagination.innerHTML = parts.join("");

    elements.pagination.querySelectorAll(".page-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const page = parseInt(e.target.getAttribute("data-page"));
            if (page && page !== current) performKeywordSearch(page);
        });
    });
}

// Search functions
async function performKeywordSearch(page = 1) {
    try {
        elements.resultsInfo.textContent = "Tìm kiếm...";

        const cacheKey = clientCache.makeSearchKey({
            q: currentQuery,
            page,
            limit: currentLimit,
        });

        let data,
            fromCache = false;
        const cached = clientCache.get(cacheKey);

        if (cached) {
            data = cached;
            fromCache = true;
            console.log("🚀 Cache hit:", cacheKey);
        } else {
            const endpoint = `/api/search?q=${encodeURIComponent(currentQuery)}&page=${page}&limit=${currentLimit}`;
            const r = await fetch(endpoint);
            data = await r.json();
            clientCache.set(cacheKey, data);
        }

        renderImages(data.images || [], { method: "keyword" });
        renderPagination(data.pagination);
        currentPage = data.pagination?.current || page;

        const cacheIndicator = fromCache ? " 🚀" : "";
        elements.resultsInfo.textContent = `${data.pagination?.total || 0} ảnh • Trang ${currentPage}/${data.pagination?.pages || 1}${cacheIndicator}`;

        scrollToForm();
    } catch (err) {
        elements.resultsInfo.textContent = "Lỗi: " + err.message;
    }
}

const debouncedSearch = debounce((query) => {
    currentQuery = query;
    currentPage = 1;
    performKeywordSearch(1);
}, 300);

// Preview functions
function showPreview(src) {
    if (elements.queryPath && elements.previewCard) {
        elements.queryPath.src = src;
        elements.queryPath.style.display = "block";
        elements.queryPath.style.maxWidth = "300px";
        elements.previewCard.style.display = "block";
    }
}

function hidePreview() {
    if (elements.queryPath && elements.previewCard) {
        elements.queryPath.style.display = "none";
        elements.queryPath.src = "";
        elements.previewCard.style.display = "none";
    }
}

function scrollToForm() {
    if (elements.unifiedForm) {
        window.scrollTo({ top: elements.unifiedForm.offsetTop, behavior: "smooth" });
    }
}

// Event bindings
document.addEventListener("DOMContentLoaded", () => {
    // Upload form
    if (elements.uploadForm) {
        elements.uploadForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            elements.uploadMsg.textContent = "";

            const file = document.getElementById("imageInput")?.files[0];
            if (!file) {
                elements.uploadMsg.textContent = "Chọn ảnh";
                elements.uploadMsg.className = "error";
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                elements.uploadMsg.textContent = "File > 10MB";
                elements.uploadMsg.className = "error";
                return;
            }

            elements.uploadBtn.disabled = true;

            try {
                const fd = new FormData(elements.uploadForm);
                const resp = await fetch("/api/upload", { method: "POST", body: fd });
                const data = await resp.json();

                if (!resp.ok) throw new Error(data.error || "Upload lỗi");

                elements.uploadMsg.textContent = `Thành công (ID: ${data.imageId})`;
                elements.uploadMsg.className = "success";

                // Fireworks
                if (typeof createFireworksCelebration === "function") {
                    createFireworksCelebration();
                }
            } catch (err) {
                elements.uploadMsg.textContent = err.message;
                elements.uploadMsg.className = "error";
            } finally {
                elements.uploadBtn.disabled = false;
            }
        });
    }

    // Camera button
    if (elements.cameraBtn) {
        elements.cameraBtn.addEventListener("click", () => elements.imageInput?.click());
    }

    // Toggle advanced options by method
    if (elements.methodSelect && elements.advancedOpts) {
        const syncAdvanced = () => {
            const m = elements.methodSelect.value;
            elements.advancedOpts.style.display = m === "full" ? "flex" : "none";
        };
        elements.methodSelect.addEventListener("change", syncAdvanced);
        syncAdvanced();
    }

    // Image input
    if (elements.imageInput) {
        elements.imageInput.addEventListener("change", async () => {
            const file = elements.imageInput.files[0];
            if (!file) {
                hidePreview();
                return;
            }

            // Preview
            const reader = new FileReader();
            reader.onload = (e) => showPreview(e.target.result);
            reader.readAsDataURL(file);

            // Auto search
            elements.resultsInfo.textContent = "Tìm bằng ảnh...";
            const fd = new FormData();
            fd.append("image", file);
            const method = elements.methodSelect?.value || "auto";
            const endpointFactory = SEARCH_ENDPOINTS[method] || SEARCH_ENDPOINTS.hash;
            const endpoint = typeof endpointFactory === "function" ? endpointFactory() : endpointFactory;

            try {
                const resp = await fetch(endpoint, { method: "POST", body: fd });
                const data = await resp.json();
                renderImages(data.results || [], {
                    method: data.method || (method === "full" || method === "auto" ? "full" : "hash"),
                });
                renderPagination(null);
                elements.resultsInfo.textContent = `${data.results?.length || 0} ảnh`;
            } catch (err) {
                elements.resultsInfo.textContent = "Lỗi: " + err.message;
            }
        });
    }

    // Unified form
    if (elements.unifiedForm) {
        elements.unifiedForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            elements.results.innerHTML = "";

            const query = elements.queryInput?.value.trim() || "";
            const file = elements.imageInput?.files[0];
            const imgUrl = elements.imgUrl?.value.trim() || "";
            const method = elements.methodSelect?.value || "auto";

            if (imgUrl && !file) showPreview(imgUrl);

            try {
                if (file || imgUrl) {
                    // Image search
                    elements.resultsInfo.textContent = "Tìm bằng ảnh...";
                    const endpointFactory = SEARCH_ENDPOINTS[method] || SEARCH_ENDPOINTS.hash;
                    const endpoint = typeof endpointFactory === "function" ? endpointFactory() : endpointFactory;
                    let resp;

                    if (file) {
                        const fd = new FormData();
                        fd.append("image", file);
                        resp = await fetch(endpoint, { method: "POST", body: fd });
                    } else {
                        resp = await fetch(endpoint, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ url: imgUrl }),
                        });
                    }

                    const data = await resp.json();
                    renderImages(data.results || [], {
                        method: data.method || (method === "full" ? "full" : method === "clip" || method === "auto" ? "clip" : "hash"),
                    });
                    elements.resultsInfo.textContent = `${data.results?.length || 0} ảnh`;
                } else if (query) {
                    // Keyword search
                    hidePreview();
                    debouncedSearch(query);
                }
            } catch (err) {
                elements.resultsInfo.textContent = "Lỗi: " + err.message;
            }
        });
    }

    // Remove preview
    const removeBtn = document.getElementById("removePreviewBtn");
    if (removeBtn) {
        removeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            if (elements.imageInput) elements.imageInput.value = "";
            if (elements.imgUrl) elements.imgUrl.value = "";
            hidePreview();
            elements.resultsInfo.textContent = "Đã gỡ ảnh";
        });
    }

    // Event delegation for results actions (reduce listeners -> faster)
    if (elements.results) {
        elements.results.addEventListener("click", async (e) => {
            const target = e.target.closest("button");
            if (!target) return;
            const id = target.getAttribute("data-id");
            if (!id) return;

            if (target.classList.contains("similar-btn")) {
                try {
                    elements.resultsInfo.textContent = "Đang tìm tương tự...";
                    let endpoint = `/api/image/${id}/similar?threshold=16&topK=24`;
                    const method = elements.methodSelect?.value || "auto";
                    if (method === "full") {
                        const combine = (elements.combineSelect?.value || "lexi").toLowerCase();
                        const restrict = elements.restrictToClip?.checked ? "1" : "0";
                        const colorVariant = (elements.colorVariant?.value || "multi").toLowerCase();
                        const lexiEps = Number(elements.lexiEps?.value || 0.02);
                        const params = new URLSearchParams({ method: "full", topK: "24", minSim: "0.25", combine, restrictToClip: restrict, colorVariant, lexiEps: String(lexiEps) });
                        endpoint = `/api/image/${id}/similar?` + params.toString();
                    }
                    const r = await fetch(endpoint);
                    const data = await r.json();
                    renderImages(data.results || [], { method: data.method || "full" });
                    renderPagination(null);
                    elements.resultsInfo.textContent = `${data.results?.length || 0} ảnh tương tự`;
                    scrollToForm();
                } catch (err) {
                    elements.resultsInfo.textContent = "Lỗi: " + err.message;
                }
                return;
            }

            if (target.classList.contains("delete-btn")) {
                const card = target.closest(".item");
                if (!confirm(`Xóa ảnh #${id}?`)) return;
                const prevText = target.textContent;
                target.disabled = true;
                target.textContent = "Xóa...";
                try {
                    const resp = await fetch(`/api/image/${id}`, { method: "DELETE" });
                    const data = await resp.json();
                    if (!resp.ok) throw new Error(data?.error || "Xóa lỗi");
                    card?.remove();
                    elements.resultsInfo.textContent = `Đã xóa #${id}`;
                    clientCache.deleteByPrefix("search:list:");
                } catch (err) {
                    alert("Lỗi: " + err.message);
                    target.disabled = false;
                    target.textContent = prevText;
                }
            }
        });
    }

    // console.log("🚀 Search App loaded");
    // console.log("💾 Cache:", clientCache.getStats());

    // currentQuery rỗng -> backend trả danh sách ảnh mới nhất có phân trang
    performKeywordSearch(1);
});
