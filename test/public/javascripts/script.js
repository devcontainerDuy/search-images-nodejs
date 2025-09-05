const uploadForm = document.getElementById("uploadForm");
const uploadBtn = document.getElementById("uploadBtn");
const uploadMsg = document.getElementById("uploadMsg");
uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    uploadMsg.textContent = "";
    const file = document.getElementById("imageInput").files[0];
    if (!file) {
        uploadMsg.textContent = "Vui lòng chọn ảnh";
        uploadMsg.className = "error";
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        uploadMsg.textContent = "File quá lớn (>10MB)";
        uploadMsg.className = "error";
        return;
    }
    uploadBtn.disabled = true;
    const fd = new FormData(uploadForm);
    try {
        const resp = await fetch("/api/upload", {
            method: "POST",
            body: fd,
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) throw new Error(data.error || "Upload thất bại");
        uploadMsg.textContent = "Upload thành công (ID: " + data.imageId + ")";
        uploadMsg.className = "success";

        // Trigger fireworks celebration
        if (typeof createFireworksCelebration === "function") {
            createFireworksCelebration();
        }
    } catch (err) {
        uploadMsg.textContent = err.message;
        uploadMsg.className = "error";
    } finally {
        uploadBtn.disabled = false;
    }
});

// Unified search logic (keyword + image)
const results = document.getElementById("results");
const resultsInfo = document.getElementById("resultsInfo");
const paginationEl = document.getElementById("pagination");
const unifiedForm = document.getElementById("unifiedSearch");
const methodSelect = document.getElementById("method");
const cameraBtnUnified = document.getElementById("cameraBtnUnified");
const imageInputUnified = document.getElementById("imageInputUnified");
const imgUrlUnified = document.getElementById("imgUrlUnified");

function renderImages(list, meta = {}) {
    results.innerHTML = "";
    (list || []).forEach((img) => {
        const el = document.createElement("div");
        el.className = "item";
        const footer =
            meta.method === "clip"
                ? "Cosine: " + Number(img.similarity ?? 0).toFixed(3)
                : img.distance != null
                ? "Hamming: " + img.distance + " • Sim: " + Math.round((img.similarity || 0) * 100) + "%"
                : "";
        const idTag = img.imageId || img.id;
        el.innerHTML = `<img src="${img.url}" alt="${img.title || "Ảnh tìm kiếm"}" loading="lazy" />
                        <div class="meta">
								<div class="tag">#${idTag}</div>
                        ${img.title || ""}
                        ${footer ? `<div class="muted">${footer}</div>` : ""}
                        	<div class="flex" style="margin-top:6px">
                        		<button data-id="${idTag}" class="similar-btn">Tìm ảnh tương tự</button>
                                <button data-id="${idTag}" class="delete-btn btn btn-danger" title="Xóa ảnh">Xóa</button>
                        	</div>
                        </div>`;
        results.appendChild(el);
    });
    // attach similar handlers
    results.querySelectorAll(".similar-btn").forEach((btn) => {
        btn.addEventListener("click", async (ev) => {
            const id = ev.currentTarget.getAttribute("data-id");
            try {
                resultsInfo.textContent = "Đang tìm ảnh tương tự...";
                const r = await fetch("/api/image/" + id + "/similar?threshold=16&topK=24");
                const data = await r.json();
                renderImages(data.results || [], {
                    method: "hash",
                });
                // similar-by-id is not paginated
                if (typeof renderPagination === "function") renderPagination(null);
                resultsInfo.textContent = "Kết quả ảnh tương tự (" + (data.results?.length || 0) + ")";
                window.scrollTo({
                    top: unifiedForm.offsetTop,
                    behavior: "smooth",
                });
            } catch (err) {
                resultsInfo.textContent = "Lỗi tìm ảnh tương tự: " + err.message;
            }
        });
    });
    // attach delete handlers
    results.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", async (ev) => {
            const id = ev.currentTarget.getAttribute("data-id");
            const card = ev.currentTarget.closest(".item");
            if (!id) return;
            if (!confirm(`Bạn có chắc muốn xóa ảnh #${id}?`)) return;
            const prevText = ev.currentTarget.textContent;
            ev.currentTarget.disabled = true;
            ev.currentTarget.textContent = "Đang xóa...";
            try {
                const resp = await fetch(`/api/image/${id}`, { method: "DELETE" });
                const data = await resp.json();
                if (!resp.ok || data?.success !== true) throw new Error(data?.error || "Xóa thất bại");
                if (card) card.remove();
                resultsInfo.textContent = `Đã xóa ảnh #${id}`;
            } catch (err) {
                alert("Lỗi xóa: " + err.message);
                ev.currentTarget.disabled = false;
                ev.currentTarget.textContent = prevText;
            }
        });
    });
}

// Pagination helpers for keyword search
let currentQuery = "";
let currentPage = 1;
let currentLimit = 20;

function renderPagination(pagination) {
    if (!pagination || !pagination.pages || pagination.pages <= 1) {
        paginationEl.innerHTML = "";
        return;
    }
    const { current, pages } = pagination;
    const maxButtons = 7; // show up to 7 buttons
    let start = Math.max(1, current - Math.floor(maxButtons / 2));
    let end = start + maxButtons - 1;
    if (end > pages) {
        end = pages;
        start = Math.max(1, end - maxButtons + 1);
    }
    const parts = [];
    parts.push(`<button class="page-btn" data-page="${current - 1}" ${current === 1 ? "disabled" : ""}>« Trước</button>`);
    if (start > 1) parts.push(`<button class="page-btn" data-page="1">1</button><span class="page-ellipsis">…</span>`);
    for (let i = start; i <= end; i++) {
        parts.push(`<button class="page-btn ${i === current ? "active" : ""}" data-page="${i}">${i}</button>`);
    }
    if (end < pages) parts.push(`<span class="page-ellipsis">…</span><button class="page-btn" data-page="${pages}">${pages}</button>`);
    parts.push(`<button class="page-btn" data-page="${current + 1}" ${current === pages ? "disabled" : ""}>Sau »</button>`);
    paginationEl.innerHTML = parts.join("");

    paginationEl.querySelectorAll(".page-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const page = parseInt(e.currentTarget.getAttribute("data-page"), 10);
            if (!page || page === current || page < 1 || page > pages) return;
            performKeywordSearch(page);
        });
    });
}

async function performKeywordSearch(page = 1) {
    try {
        resultsInfo.textContent = "Đang tìm theo từ khóa...";
        const r = await fetch(`/api/search?q=${encodeURIComponent(currentQuery)}&page=${page}&limit=${currentLimit}`);
        const data = await r.json();
        renderImages(data.images || [], { method: "keyword" });
        renderPagination(data.pagination);
        currentPage = data.pagination?.current || page;
        resultsInfo.textContent = `Tổng: ${data.pagination?.total || 0} • Trang ${currentPage}/${data.pagination?.pages || 1}`;
        window.scrollTo({ top: unifiedForm.offsetTop, behavior: "smooth" });
    } catch (err) {
        resultsInfo.textContent = "Lỗi tìm kiếm: " + err.message;
    }
}

cameraBtnUnified.addEventListener("click", () => imageInputUnified.click());

// Preview image when selected
function previewImage(file) {
    const queryPath = document.getElementById("queryPath");
    const previewCard = document.getElementById("previewCard");

    if (!queryPath || !previewCard) return;

    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            queryPath.src = e.target.result;
            queryPath.style.display = "block";
            queryPath.style.width = "100%";
            queryPath.style.maxWidth = "300px";
            queryPath.style.height = "auto";
            queryPath.style.borderRadius = "8px";
            previewCard.style.display = "block";
        };
        reader.readAsDataURL(file);
    } else {
        queryPath.style.display = "none";
        queryPath.src = "";
        previewCard.style.display = "none";
    }
}

// Preview image from URL
function previewImageFromURL(url) {
    const queryPath = document.getElementById("queryPath");
    const previewCard = document.getElementById("previewCard");

    if (!queryPath || !previewCard) return;

    if (url) {
        queryPath.src = url;
        queryPath.style.display = "block";
        queryPath.style.width = "100%";
        queryPath.style.maxWidth = "300px";
        queryPath.style.height = "auto";
        queryPath.style.borderRadius = "8px";
        previewCard.style.display = "block";
    } else {
        queryPath.style.display = "none";
        queryPath.src = "";
        previewCard.style.display = "none";
    }
}

imageInputUnified.addEventListener("change", async () => {
    const file = imageInputUnified.files[0];
    if (!file) {
        previewImage(null); // Hide preview if no file
        return;
    }

    // Show preview
    previewImage(file);

    resultsInfo.textContent = "Đang tìm bằng ảnh...";
    const fd = new FormData();
    fd.append("image", file);
    const method = methodSelect.value;
    const ep = method === "clip" || method === "auto" ? "/api/search-by-image?method=clip&minSim=0.25&topK=24" : "/api/search-by-image?threshold=16&topK=24";
    try {
        const resp = await fetch(ep, { method: "POST", body: fd });
        const data = await resp.json();
        renderImages(data.results || [], {
            method: data.method || (method === "clip" || method === "auto" ? "clip" : "hash"),
        });
        renderPagination(null);
        resultsInfo.textContent = "Tìm thấy " + (data.results?.length || 0) + " ảnh";
    } catch (err) {
        resultsInfo.textContent = "Lỗi tìm kiếm ảnh: " + err.message;
    }
    // Note: We don't clear imageInputUnified.value here to keep the preview
});

unifiedForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    results.innerHTML = "";
    const q = document.getElementById("q").value.trim();
    const file = imageInputUnified.files[0];
    const imgUrl = imgUrlUnified.value.trim();
    const method = methodSelect.value;

    // Show preview for URL if provided and no file selected
    if (imgUrl && !file) {
        previewImageFromURL(imgUrl);
    }

    try {
        if (file || imgUrl) {
            // Image-based search
            resultsInfo.textContent = "Đang tìm bằng ảnh...";
            let resp;
            const ep = method === "clip" || method === "auto" ? "/api/search-by-image?method=clip&minSim=0.25&topK=24" : "/api/search-by-image?threshold=16&topK=24";
            if (file) {
                const fd = new FormData();
                fd.append("image", file);
                resp = await fetch(ep, {
                    method: "POST",
                    body: fd,
                });
            } else {
                resp = await fetch(ep, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: imgUrl }),
                });
            }
            const data = await resp.json();
            renderImages(data.results || [], {
                method: data.method || (method === "clip" || method === "auto" ? "clip" : "hash"),
            });
            resultsInfo.textContent = "Tìm thấy " + (data.results?.length || 0) + " ảnh";
        } else {
            // Keyword search with pagination - hide preview
            previewImage(null);
            currentQuery = q;
            currentPage = 1;
            await performKeywordSearch(1);
        }
    } catch (err) {
        resultsInfo.textContent = "Lỗi tìm kiếm: " + err.message;
    }
});
