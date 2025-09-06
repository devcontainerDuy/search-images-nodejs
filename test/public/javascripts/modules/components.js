// ============ UI COMPONENTS ============
import { lazyLoader, DOMUtils, performanceMonitor } from './utils.js';
import { apiClient } from './apiClient.js';

class ImageRenderer {
    constructor(container) {
        this.container = container;
        this.resultsInfo = document.getElementById('resultsInfo');
        this.unifiedForm = document.getElementById('unifiedSearch');
    }

    render(images, meta = {}) {
        performanceMonitor.start('renderImages');
        
        this.container.innerHTML = "";
        
        if (!images || images.length === 0) {
            this.container.innerHTML = '<div class="no-results">Không tìm thấy kết quả nào</div>';
            return;
        }

        const elements = images.map(img => this.createImageCard(img, meta));
        DOMUtils.batchAppend(this.container, elements);
        
        performanceMonitor.end('renderImages');
    }

    createImageCard(img, meta) {
        const footer = this.createFooter(img, meta);
        const idTag = img.imageId || img.id;
        
        const card = DOMUtils.createElement('div', {
            className: 'item'
        });

        // Create lazy-loaded image
        const lazyImg = lazyLoader.createLazyImage(
            img.url, 
            img.title || "Ảnh tìm kiếm"
        );

        const metaDiv = DOMUtils.createElement('div', {
            className: 'meta',
            innerHTML: `
                <div class="tag">#${idTag}</div>
                ${img.title || ""}
                ${footer ? `<div class="muted">${footer}</div>` : ""}
                <div class="flex" style="margin-top:6px">
                    <button data-id="${idTag}" class="similar-btn">Tìm ảnh tương tự</button>
                    <button data-id="${idTag}" class="delete-btn btn btn-danger" title="Xóa ảnh">Xóa</button>
                </div>
            `
        });

        card.appendChild(lazyImg);
        card.appendChild(metaDiv);

        // Attach event listeners
        this.attachCardEvents(card, idTag);

        return card;
    }

    createFooter(img, meta) {
        if (meta.method === "clip") {
            return "Cosine: " + Number(img.similarity ?? 0).toFixed(3);
        } else if (img.distance != null) {
            return "Hamming: " + img.distance + " • Sim: " + Math.round((img.similarity || 0) * 100) + "%";
        }
        return "";
    }

    attachCardEvents(card, imageId) {
        // Similar button
        const similarBtn = card.querySelector('.similar-btn');
        similarBtn?.addEventListener('click', async (e) => {
            await this.handleSimilarSearch(imageId);
        });

        // Delete button  
        const deleteBtn = card.querySelector('.delete-btn');
        deleteBtn?.addEventListener('click', async (e) => {
            await this.handleImageDelete(imageId, card);
        });
    }

    async handleSimilarSearch(imageId) {
        try {
            this.resultsInfo.textContent = "Đang tìm ảnh tương tự...";
            
            const { data } = await apiClient.findSimilarImages(imageId);
            
            this.render(data.results || [], { method: "hash" });
            
            // Similar search is not paginated
            if (window.renderPagination) {
                window.renderPagination(null);
            }
            
            this.resultsInfo.textContent = `Kết quả ảnh tương tự (${data.results?.length || 0})`;
            
            DOMUtils.smoothScrollTo(this.unifiedForm);
        } catch (error) {
            this.resultsInfo.textContent = "Lỗi tìm ảnh tương tự: " + error.message;
        }
    }

    async handleImageDelete(imageId, card) {
        if (!confirm(`Bạn có chắc muốn xóa ảnh #${imageId}?`)) return;

        const deleteBtn = card.querySelector('.delete-btn');
        const prevText = deleteBtn.textContent;
        
        deleteBtn.disabled = true;
        deleteBtn.textContent = "Đang xóa...";

        try {
            await apiClient.deleteImage(imageId);
            
            card.remove();
            this.resultsInfo.textContent = `Đã xóa ảnh #${imageId}`;
        } catch (error) {
            alert("Lỗi xóa: " + error.message);
            deleteBtn.disabled = false;
            deleteBtn.textContent = prevText;
        }
    }
}

class PaginationRenderer {
    constructor(container) {
        this.container = container;
    }

    render(pagination, onPageClick) {
        if (!pagination || !pagination.pages || pagination.pages <= 1) {
            this.container.innerHTML = "";
            return;
        }

        const { current, pages } = pagination;
        const maxButtons = 7;
        let start = Math.max(1, current - Math.floor(maxButtons / 2));
        let end = start + maxButtons - 1;
        
        if (end > pages) {
            end = pages;
            start = Math.max(1, end - maxButtons + 1);
        }

        const buttons = [];
        
        // Previous button
        buttons.push(this.createPageButton('« Trước', current - 1, current === 1, onPageClick));
        
        // First page + ellipsis
        if (start > 1) {
            buttons.push(this.createPageButton('1', 1, false, onPageClick));
            if (start > 2) {
                buttons.push('<span class="page-ellipsis">…</span>');
            }
        }
        
        // Page numbers
        for (let i = start; i <= end; i++) {
            buttons.push(this.createPageButton(i.toString(), i, false, onPageClick, i === current));
        }
        
        // Last page + ellipsis
        if (end < pages) {
            if (end < pages - 1) {
                buttons.push('<span class="page-ellipsis">…</span>');
            }
            buttons.push(this.createPageButton(pages.toString(), pages, false, onPageClick));
        }
        
        // Next button
        buttons.push(this.createPageButton('Sau »', current + 1, current === pages, onPageClick));
        
        this.container.innerHTML = buttons.join('');
    }

    createPageButton(text, page, disabled, onClick, active = false) {
        const className = `page-btn${active ? ' active' : ''}`;
        const disabledAttr = disabled ? ' disabled' : '';
        
        return `<button class="${className}" data-page="${page}"${disabledAttr}>${text}</button>`;
    }
}

export { ImageRenderer, PaginationRenderer };
