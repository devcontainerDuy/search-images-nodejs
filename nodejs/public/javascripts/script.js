let page = 1,
    size = 12,
    total = 0;

const ele = {
    form: document.getElementById("uploadForm"),
    gallery: document.getElementById("gallery"),
    pageInfo: document.getElementById("pageInfo"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
};

async function loadPage(p = 1) {
    const res = await fetch(`/api/images?page=${p}&size=${size}`);
    const data = await res.json();
    page = data.page;
    total = data.total;
    ele.pageInfo.textContent = `Page ${data.page}`;
    ele.gallery.innerHTML = "";
    for (const item of data.items) {
        const col = document.createElement("div");
        col.className = "col-3";
        const label = item.title && item.title.trim() ? item.title : item.filename;
        col.innerHTML = `
            <div class="card">
                <img src="${item.url}" class="card-img-top" alt="${item.filename}" loading="lazy" fetchpriority="low" />
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <small title="${item.filename}">${label}</small>
                        <button class="btn btn-sm btn-danger" data-id="${item.id}">Xóa</button>
                    </div>
                </div>
            </div>`;

        ele.gallery.appendChild(col);
    }
}

ele.gallery.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (!confirm("Xóa ảnh này?")) return;
    const res = await fetch(`/api/images/${id}`, { method: "DELETE" });
    if (res.status === 204) {
        loadPage(page);
        return;
    }
    try {
        const json = await res.json();
        if (json && json.status === "ok") loadPage(page);
    } catch (_) {}
});

ele.prevBtn.onclick = () => {
    if (page > 1) loadPage(page - 1);
};
ele.nextBtn.onclick = () => {
    if (page * size < total) loadPage(page + 1);
};

loadPage(1);

// Intercept upload form to show success message and refresh gallery
document.addEventListener("DOMContentLoaded", () => {
    if (!ele.form) return;
    ele.form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(ele.form);
        try {
            const res = await fetch("/api/images", { method: "POST", body: fd });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || "Tải lên thành công");
                loadPage(1);
                ele.form.reset();
            } else {
                alert(data.error || "Upload failed");
            }
        } catch (err) {
            alert("Lỗi kết nối khi tải lên");
        }
    });
});
