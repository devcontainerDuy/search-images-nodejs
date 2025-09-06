// ============ MAIN APPLICATION ============
import { apiClient } from './modules/apiClient.js';
import { ImageRenderer, PaginationRenderer } from './modules/components.js';
import { debounce, performanceMonitor } from './modules/utils.js';
import { getSearchConfig } from './modules/searchConfig.js';

class SearchImageApp {
    constructor() {
        this.initializeElements();
        this.initializeRenderers();
        this.initializeState();
        this.bindEvents();
        
        console.log('🚀 Search Image App initialized');
        console.log('💾 Cache stats:', this.getCacheStats());
    }

    initializeElements() {
        // Upload elements
        this.uploadForm = document.getElementById("uploadForm");
        this.uploadBtn = document.getElementById("uploadBtn");
        this.uploadMsg = document.getElementById("uploadMsg");

        // Search elements
        this.unifiedForm = document.getElementById("unifiedSearch");
        this.methodSelect = document.getElementById("method");
        this.imageInputUnified = document.getElementById("imageInputUnified");
        this.imgUrlUnified = document.getElementById("imgUrlUnified");
        this.cameraBtnUnified = document.getElementById("cameraBtnUnified");
        this.queryInput = document.getElementById("q");

        // Results elements
        this.results = document.getElementById("results");
        this.resultsInfo = document.getElementById("resultsInfo");
        this.paginationEl = document.getElementById("pagination");
        
        // Preview elements
        this.queryPath = document.getElementById("queryPath");
        this.previewCard = document.getElementById("previewCard");
    }

    initializeRenderers() {
        this.imageRenderer = new ImageRenderer(this.results);
        this.paginationRenderer = new PaginationRenderer(this.paginationEl);
    }

    initializeState() {
        this.currentQuery = "";
        this.currentPage = 1;
        this.currentLimit = 20;
        
        // Debounced search function
        this.debouncedKeywordSearch = debounce((query) => {
            this.performKeywordSearch(query, 1);
        }, 300);
    }

    bindEvents() {
        this.bindUploadEvents();
        this.bindSearchEvents();
        this.bindPreviewEvents();
    }

    bindUploadEvents() {
        this.uploadForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            await this.handleUpload();
        });
    }

    bindSearchEvents() {
        // Unified search form
        this.unifiedForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            await this.handleSearch();
        });

        // Image input change
        this.imageInputUnified?.addEventListener("change", async () => {
            await this.handleImageInput();
        });

        // Camera button
        this.cameraBtnUnified?.addEventListener("click", () => {
            this.imageInputUnified?.click();
        });

        // Pagination clicks
        this.paginationEl?.addEventListener("click", (e) => {
            if (e.target.classList.contains("page-btn")) {
                const page = parseInt(e.target.getAttribute("data-page"));
                if (page && !e.target.disabled) {
                    this.performKeywordSearch(this.currentQuery, page);
                }
            }
        });
    }

    bindPreviewEvents() {
        const removeBtn = document.getElementById("removePreviewBtn");
        removeBtn?.addEventListener("click", () => {
            this.clearPreview();
        });
    }

    async handleUpload() {
        performanceMonitor.start('upload');
        
        this.uploadMsg.textContent = "";
        const file = document.getElementById("imageInput")?.files[0];
        
        if (!file) {
            this.uploadMsg.textContent = "Vui lòng chọn ảnh";
            this.uploadMsg.className = "error";
            return;
        }
        
        if (file.size > 10 * 1024 * 1024) {
            this.uploadMsg.textContent = "File quá lớn (>10MB)";
            this.uploadMsg.className = "error";
            return;
        }

        this.uploadBtn.disabled = true;
        
        try {
            const formData = new FormData(this.uploadForm);
            const { data } = await apiClient.uploadImage(formData);
            
            this.uploadMsg.textContent = `Upload thành công (ID: ${data.imageId})`;
            this.uploadMsg.className = "success";

            // Trigger fireworks celebration
            if (typeof createFireworksCelebration === "function") {
                createFireworksCelebration();
            }
        } catch (error) {
            this.uploadMsg.textContent = error.message;
            this.uploadMsg.className = "error";
        } finally {
            this.uploadBtn.disabled = false;
            performanceMonitor.end('upload');
        }
    }

    async handleSearch() {
        const query = this.queryInput?.value.trim() || "";
        const file = this.imageInputUnified?.files[0];
        const imgUrl = this.imgUrlUnified?.value.trim() || "";
        const method = this.methodSelect?.value || "auto";

        this.results.innerHTML = "";

        if (imgUrl && !file) {
            this.showPreviewFromURL(imgUrl);
        }

        try {
            if (file || imgUrl) {
                await this.handleImageSearch(method, file, imgUrl);
            } else if (query) {
                this.clearPreview();
                await this.performKeywordSearch(query, 1);
            }
        } catch (error) {
            this.resultsInfo.textContent = "Lỗi tìm kiếm: " + error.message;
        }
    }

    async handleImageInput() {
        const file = this.imageInputUnified?.files[0];
        
        if (!file) {
            this.clearPreview();
            return;
        }

        this.showPreviewFromFile(file);
        
        const method = this.methodSelect?.value || "auto";
        await this.handleImageSearch(method, file);
    }

    async handleImageSearch(method, file, imgUrl = null) {
        performanceMonitor.start('imageSearch');
        
        this.resultsInfo.textContent = "Đang tìm bằng ảnh...";
        
        try {
            let imageData;
            if (file) {
                const formData = new FormData();
                formData.append("image", file);
                imageData = formData;
            } else if (imgUrl) {
                imageData = { url: imgUrl };
            }

            const { data } = await apiClient.searchByImage(method, imageData);
            const config = getSearchConfig(method);
            
            this.imageRenderer.render(data.results || [], {
                method: data.method || config.displayMethod,
            });
            
            this.paginationRenderer.render(null); // Image search không có pagination
            this.resultsInfo.textContent = `Tìm thấy ${data.results?.length || 0} ảnh`;
        } catch (error) {
            this.resultsInfo.textContent = "Lỗi tìm kiếm ảnh: " + error.message;
        } finally {
            performanceMonitor.end('imageSearch');
        }
    }

    async performKeywordSearch(query, page = 1) {
        performanceMonitor.start('keywordSearch');
        
        this.currentQuery = query;
        this.currentPage = page;
        
        try {
            this.resultsInfo.textContent = "Đang tìm theo từ khóa...";
            
            const { data, fromCache } = await apiClient.searchKeywords({
                q: query,
                page,
                limit: this.currentLimit
            });

            this.imageRenderer.render(data.images || [], { method: "keyword" });
            
            this.paginationRenderer.render(data.pagination, (page) => {
                this.performKeywordSearch(query, page);
            });
            
            const cacheIndicator = fromCache ? " (cached)" : "";
            this.resultsInfo.textContent = 
                `Tổng: ${data.pagination?.total || 0} • Trang ${this.currentPage}/${data.pagination?.pages || 1}${cacheIndicator}`;
            
            window.scrollTo({ 
                top: this.unifiedForm.offsetTop, 
                behavior: "smooth" 
            });
        } catch (error) {
            this.resultsInfo.textContent = "Lỗi tìm kiếm: " + error.message;
        } finally {
            performanceMonitor.end('keywordSearch');
        }
    }

    showPreviewFromFile(file) {
        if (!this.queryPath || !this.previewCard) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.queryPath.src = e.target.result;
            this.showPreview();
        };
        reader.readAsDataURL(file);
    }

    showPreviewFromURL(url) {
        if (!this.queryPath || !this.previewCard) return;
        
        this.queryPath.src = url;
        this.showPreview();
    }

    showPreview() {
        if (this.queryPath && this.previewCard) {
            this.queryPath.style.display = "block";
            this.queryPath.style.width = "100%";
            this.queryPath.style.maxWidth = "300px";
            this.queryPath.style.height = "auto";
            this.queryPath.style.borderRadius = "8px";
            this.previewCard.style.display = "block";
        }
    }

    clearPreview() {
        if (this.imageInputUnified) this.imageInputUnified.value = "";
        if (this.imgUrlUnified) this.imgUrlUnified.value = "";
        
        if (this.queryPath && this.previewCard) {
            this.queryPath.style.display = "none";
            this.queryPath.src = "";
            this.previewCard.style.display = "none";
        }
        
        this.resultsInfo.textContent = "Đã gỡ ảnh truy vấn";
    }

    getCacheStats() {
        return apiClient.cache?.getStats?.() || "No cache stats available";
    }
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    window.searchApp = new SearchImageApp();
});
