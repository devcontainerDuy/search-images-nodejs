// ============ PERFORMANCE UTILITIES ============

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle utility 
function throttle(func, wait) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, wait);
        }
    };
}

// Intersection Observer for lazy loading
class LazyImageLoader {
    constructor(options = {}) {
        this.options = {
            rootMargin: '50px',
            threshold: 0.1,
            ...options
        };
        
        this.observer = new IntersectionObserver(
            this.handleIntersection.bind(this),
            this.options
        );
        
        this.placeholderSVG = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkxvYWRpbmcuLi48L3RleHQ+PC9zdmc+";
    }

    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    this.observer.unobserve(img);
                }
            }
        });
    }

    observe(img) {
        this.observer.observe(img);
    }

    unobserve(img) {
        this.observer.unobserve(img);
    }

    createLazyImage(src, alt = "Loading image") {
        const img = document.createElement('img');
        img.src = this.placeholderSVG;
        img.dataset.src = src;
        img.alt = alt;
        img.loading = 'lazy';
        this.observe(img);
        return img;
    }
}

// Batch processor for API calls
class BatchProcessor {
    constructor(batchSize = 3, delay = 150) {
        this.batchSize = batchSize;
        this.delay = delay;
        this.queue = [];
        this.processing = false;
    }
    
    add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            if (!this.processing) {
                this.process();
            }
        });
    }
    
    async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        
        while (this.queue.length > 0) {
            const batch = this.queue.splice(0, this.batchSize);
            
            try {
                const promises = batch.map(({ task }) => task());
                const results = await Promise.allSettled(promises);
                
                results.forEach((result, index) => {
                    const { resolve, reject } = batch[index];
                    if (result.status === 'fulfilled') {
                        resolve(result.value);
                    } else {
                        reject(result.reason);
                    }
                });
                
                if (this.queue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, this.delay));
                }
            } catch (error) {
                batch.forEach(({ reject }) => reject(error));
            }
        }
        
        this.processing = false;
    }
}

// DOM utilities
const DOMUtils = {
    // Create element with attributes
    createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else {
                element.setAttribute(key, value);
            }
        });
        
        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else {
                element.appendChild(child);
            }
        });
        
        return element;
    },

    // Batch DOM operations using DocumentFragment
    batchAppend(container, elements) {
        const fragment = document.createDocumentFragment();
        elements.forEach(element => fragment.appendChild(element));
        container.appendChild(fragment);
    },

    // Smooth scroll utility
    smoothScrollTo(element, offset = 0) {
        const targetPosition = element.offsetTop + offset;
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
    }
};

// Performance monitor
class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
    }

    start(label) {
        this.metrics.set(label, performance.now());
    }

    end(label) {
        const startTime = this.metrics.get(label);
        if (startTime) {
            const duration = performance.now() - startTime;
            console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
            this.metrics.delete(label);
            return duration;
        }
        return null;
    }

    memory() {
        if (performance.memory) {
            return {
                used: Math.round(performance.memory.usedJSHeapSize / 1048576),
                total: Math.round(performance.memory.totalJSHeapSize / 1048576),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
            };
        }
        return null;
    }
}

// Global instances
const lazyLoader = new LazyImageLoader();
const batchProcessor = new BatchProcessor();
const performanceMonitor = new PerformanceMonitor();

export { 
    debounce, 
    throttle, 
    LazyImageLoader, 
    BatchProcessor, 
    DOMUtils,
    PerformanceMonitor,
    lazyLoader, 
    batchProcessor,
    performanceMonitor
};
