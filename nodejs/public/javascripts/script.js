let page = 1,
    size = 12,
    total = 0;

let currentMode = "gallery"; // 'gallery' or 'search'
let searchResults = [];
let systemStats = {};

const ele = {
    form: document.getElementById("uploadForm"),
    searchForm: document.getElementById("searchForm"),
    gallery: document.getElementById("gallery"),
    pageInfo: document.getElementById("pageInfo"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    pageTitle: document.getElementById("pageTitle"),
    loadingModal: (() => {
        const el = document.getElementById("loadingModal");
        try {
            return el && window.bootstrap ? new bootstrap.Modal(el) : { show() {}, hide() {} };
        } catch {
            return { show() {}, hide() {} };
        }
    })(),

    // Search elements
    searchImage: document.getElementById("searchImage"),
    previewImage: document.getElementById("previewImage"),
    searchPreview: document.getElementById("searchPreview"),
    searchStats: document.getElementById("searchStats"),
    minSimilarity: document.getElementById("minSimilarity"),
    similarityValue: document.getElementById("similarityValue"),

    // Settings elements
    statsBtn: document.getElementById("statsBtn"),
    rebuildBtn: document.getElementById("rebuildBtn"),
    clearCacheBtn: document.getElementById("clearCacheBtn"),
    globalAugmentation: document.getElementById("globalAugmentation"),
    systemStatus: document.getElementById("systemStatus"),

    // View mode
    gridView: document.getElementById("gridView"),
    listView: document.getElementById("listView"),
};

// Utility functions
function showLoading(text = "Đang xử lý...") {
    const t = document.getElementById("loadingText");
    if (t) t.textContent = text;
    ele.loadingModal.show();
}

function hideLoading() {
    ele.loadingModal.hide();
}

function showToast(message, type = "info") {
    // Create toast element
    const toastHTML = `
        <div class="toast align-items-center text-white bg-${type === "error" ? "danger" : "success"} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>`;

    // Add to page
    let container = document.querySelector(".toast-container");
    if (!container) {
        container = document.createElement("div");
        container.className = "toast-container position-fixed top-0 end-0 p-3";
        document.body.appendChild(container);
    }

    container.insertAdjacentHTML("beforeend", toastHTML);
    const toast = new bootstrap.Toast(container.lastElementChild);
    toast.show();
}

async function loadPage(p = 1) {
    try {
        showLoading("Đang tải danh sách ảnh...");
        const res = await fetch(`/api/images?page=${p}&size=${size}`);
        const data = await res.json();

        page = data.page;
        total = data.total;
        currentMode = "gallery";

        const items = Array.isArray(data.items) ? data.items : [];
        displayResults(items, "gallery");
        updatePagination();
        updatePageTitle(`<i class="bi bi-images"></i> Kho ảnh (${total} ảnh)`);
        return items.length;
    } catch (error) {
        showToast("Lỗi khi tải danh sách ảnh", "error");
        console.error("Load page error:", error);
        return 0;
    } finally {
        hideLoading();
    }
}

function displayResults(items, mode = "gallery") {
    ele.gallery.innerHTML = "";

    if (!items || items.length === 0) {
        ele.gallery.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-search display-1 text-muted"></i>
                <h4 class="text-muted mt-3">Không tìm thấy kết quả</h4>
                <p class="text-muted">Thử điều chỉnh các tiêu chí tìm kiếm</p>
            </div>`;
        return;
    }

    const viewMode = ele.listView.checked ? "list" : "grid";
    if (viewMode === "list") {
        ele.gallery.className = "list-view";
    } else {
        ele.gallery.className = "row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 row-cols-xl-4 g-3";
    }

    items.forEach((item, index) => {
        const col = document.createElement("div");
        col.className = viewMode === "list" ? "mb-3" : "col";

        const label = item.title && item.title.trim() ? item.title : item.filename;
        const score = item.score !== undefined ? `<div class="search-score">${(item.score * 100).toFixed(1)}%</div>` : "";
        const description = item.metadata?.description ? `<small class="text-muted d-block">${item.metadata.description}</small>` : "";
        const tags = item.metadata?.tags ? `<div class="mt-1"><small class="badge bg-secondary me-1">${item.metadata.tags.split(",").join('</small><small class="badge bg-secondary me-1">')}</small></div>` : "";

        col.innerHTML = `
            <div class="card gallery-item ${mode === "search" ? "search-result" : ""}" style="animation-delay: ${index * 0.1}s">
                ${score}
                <img src="${item.url || item.image_url}" class="card-img-top" alt="${item.filename || item.image}" loading="lazy" />
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <small class="fw-bold" title="${item.filename || item.image}">${label}</small>
                            ${description}
                            ${tags}
                        </div>
                        <button class="btn btn-sm btn-outline-danger ms-2" data-id="${item.id || item.metadata?.image_id}" title="Xóa ảnh">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>`;

        ele.gallery.appendChild(col);
    });
}

function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(total / size));
    ele.pageInfo.textContent = `Trang ${page} / ${totalPages} (${total} ảnh)`;

    ele.prevBtn.disabled = page <= 1;
    ele.nextBtn.disabled = page >= totalPages;
}

function updatePageTitle(title) {
    ele.pageTitle.innerHTML = title;
}

// Search functionality
async function performSearch(formData) {
    try {
        showLoading("Đang tìm kiếm bằng AI...");

        const res = await fetch("/api/search", { method: "POST", body: formData });
        const data = await res.json();

        if (res.ok) {
            searchResults = data.results;
            currentMode = "search";

            displayResults(searchResults, "search");
            updateSearchStats(data);
            updatePageTitle(`<i class="bi bi-search"></i> Kết quả tìm kiếm AI (${data.total_results} ảnh)`);

            // Hide pagination for search results
            ele.prevBtn.style.display = "none";
            ele.nextBtn.style.display = "none";
            ele.pageInfo.textContent = `${data.total_results} kết quả tìm kiếm`;

            showToast(`Tìm thấy ${data.total_results} ảnh tương tự trong ${data.timing.total.toFixed(2)}s`);
        } else {
            showToast(data.error || "Lỗi khi tìm kiếm", "error");
        }
    } catch (error) {
        showToast("Lỗi kết nối khi tìm kiếm", "error");
        console.error("Search error:", error);
    } finally {
        hideLoading();
    }
}

function updateSearchStats(data) {
    document.getElementById("totalResults").textContent = data.total_results;
    document.getElementById("searchTime").textContent = data.timing.total.toFixed(3);
    document.getElementById("modelUsed").textContent = data.model;
    document.getElementById("augmentationUsed").textContent = data.use_augmentation ? "Bật" : "Tắt";

    ele.searchStats.style.display = "block";
}

// System management functions
async function loadSystemStats() {
    try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        systemStats = data;

        const statusHTML = `
            <div><strong>📊 Tổng ảnh:</strong> ${data.total_images}</div>
            <div><strong>🤖 Model:</strong> ${data.model}</div>
            <div><strong>🎯 Device:</strong> ${data.device}</div>
            <div><strong>⚡ Tìm kiếm:</strong> ${data.performance_stats.total_searches}</div>
            <div><strong>💾 Cache hit:</strong> ${data.cache_stats.cache_hit_rate}</div>
            <div><strong>🔧 Augmentation:</strong> ${data.augmentation_enabled ? "Bật" : "Tắt"}</div>
        `;

        ele.systemStatus.innerHTML = statusHTML;

        // Update global augmentation checkbox
        ele.globalAugmentation.checked = data.augmentation_enabled;
    } catch (error) {
        console.error("Load stats error:", error);
        ele.systemStatus.innerHTML = '<div class="text-danger">Lỗi khi tải thống kê</div>';
    }
}

async function rebuildEmbeddings() {
    if (!confirm("Rebuild embeddings cho tất cả ảnh? Quá trình này có thể mất vài phút.")) return;

    try {
        showLoading("Đang rebuild embeddings...");
        const res = await fetch("/api/rebuild");
        const data = await res.json();

        if (res.ok) {
            showToast(`Rebuild thành công: ${data.processed} ảnh được xử lý trong ${data.total_time?.toFixed(2) || 0}s`);
            loadSystemStats(); // Refresh stats
        } else {
            showToast(data.error || "Lỗi khi rebuild", "error");
        }
    } catch (error) {
        showToast("Lỗi kết nối khi rebuild", "error");
    } finally {
        hideLoading();
    }
}

async function clearCaches() {
    if (!confirm("Xóa tất cả cache? Điều này sẽ làm chậm tìm kiếm lần đầu.")) return;

    try {
        const res = await fetch("/api/clear-caches", { method: "DELETE" });
        const data = await res.json();

        if (res.ok) {
            showToast("Cache đã được xóa thành công");
            loadSystemStats();
        } else {
            showToast(data.error || "Lỗi khi xóa cache", "error");
        }
    } catch (error) {
        showToast("Lỗi kết nối khi xóa cache", "error");
    }
}

async function toggleGlobalAugmentation(enabled) {
    try {
        const res = await fetch("/api/toggle-augmentation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled }),
        });

        const data = await res.json();
        if (res.ok) {
            showToast(`Augmentation đã ${enabled ? "bật" : "tắt"}`);
            loadSystemStats();
        } else {
            showToast(data.error || "Lỗi khi thay đổi cài đặt", "error");
        }
    } catch (error) {
        showToast("Lỗi kết nối", "error");
    }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
    // Load initial data
    loadPage(1);
    loadSystemStats();

    // Upload form
    if (ele.form) {
        ele.form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const fd = new FormData(ele.form);
            try {
                showLoading("Đang tải lên ảnh...");
                const res = await fetch("/api/images", { method: "POST", body: fd });
                const data = await res.json();
                if (res.ok) {
                    showToast(data.message || "Tải lên thành công");
                    loadPage(1);
                    ele.form.reset();
                    loadSystemStats(); // Update image count
                } else {
                    showToast(data.error || "Upload failed", "error");
                }
            } catch (err) {
                showToast("Lỗi kết nối khi tải lên", "error");
            } finally {
                hideLoading();
            }
        });
    }

    // Search form
    if (ele.searchForm) {
        ele.searchForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const fd = new FormData(ele.searchForm);
            await performSearch(fd);
        });
    }

    // Search image preview
    if (ele.searchImage) {
        ele.searchImage.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    ele.previewImage.src = e.target.result;
                    ele.searchPreview.style.display = "block";
                };
                reader.readAsDataURL(file);
            } else {
                ele.searchPreview.style.display = "none";
            }
        });
    }

    // Similarity slider
    if (ele.minSimilarity) {
        ele.minSimilarity.addEventListener("input", (e) => {
            ele.similarityValue.textContent = e.target.value;
        });
    }

    // Gallery click handlers
    ele.gallery.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-id]");
        if (!btn) return;

        const id = btn.getAttribute("data-id");
        if (!confirm("Xóa ảnh này?")) return;

        try {
            const res = await fetch(`/api/images/${id}`, { method: "DELETE" });
            if (res.status === 204) {
                if (currentMode === "gallery") {
                    const shown = await loadPage(page);
                    if (shown === 0 && page > 1) {
                        await loadPage(page - 1);
                    }
                } else {
                    // Remove from search results
                    btn.closest(".col, .mb-3").remove();
                }
                showToast("Đã xóa ảnh");
                loadSystemStats(); // Update count
            } else {
                showToast("Lỗi khi xóa ảnh", "error");
            }
        } catch (error) {
            showToast("Lỗi kết nối khi xóa", "error");
        }
    });

    // Navigation
    ele.prevBtn.onclick = () => {
        if (page > 1) loadPage(page - 1);
    };

    ele.nextBtn.onclick = () => {
        const totalPages = Math.max(1, Math.ceil(total / size));
        if (page < totalPages) loadPage(page + 1);
    };

    // Settings buttons
    ele.statsBtn.onclick = () => {
        loadSystemStats();
        showToast("Đã cập nhật thống kê");
    };

    ele.rebuildBtn.onclick = rebuildEmbeddings;
    ele.clearCacheBtn.onclick = clearCaches;

    ele.globalAugmentation.onchange = (e) => {
        toggleGlobalAugmentation(e.target.checked);
    };

    // View mode toggle
    ele.gridView.onchange = () => {
        if (currentMode === "gallery") {
            displayResults([], "gallery");
            loadPage(page);
        } else {
            displayResults(searchResults, "search");
        }
    };

    ele.listView.onchange = () => {
        if (currentMode === "gallery") {
            displayResults([], "gallery");
            loadPage(page);
        } else {
            displayResults(searchResults, "search");
        }
    };

    // Tab switching - reset to gallery when switching to upload tab
    document.getElementById("upload-tab").addEventListener("shown.bs.tab", () => {
        if (currentMode === "search") {
            currentMode = "gallery";
            loadPage(1);
            ele.prevBtn.style.display = "inline-block";
            ele.nextBtn.style.display = "inline-block";
            ele.searchStats.style.display = "none";
        }
    });
});
