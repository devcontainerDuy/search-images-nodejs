const H_BINS = 36;
const S_BINS = 8;
const V_BINS = 8;
const EDGE_BINS = 8;
const DOM_COLORS = 5;

// RGB -> HSV (0..360, 0..1, 0..1)
function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;

    if (d !== 0) {
        switch (max) {
            case r:
                h = 60 * (((g - b) / d) % 6);
                break;
            case g:
                h = 60 * ((b - r) / d + 2);
                break;
            case b:
                h = 60 * ((r - g) / d + 4);
                break;
            default:
                h = 0;
                break;
        }
    }

    if (h < 0) h += 360;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return [h, s, v];
}

// Luminance
function luna(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// K-means đơn giản lấy màu trội (trên HSV)
function kmeansHSV(points, k, iters = 8) {
    // points: [{h,s,v, w}] w = weight (magnitude/luma)
    // khởi tạo bằng chọn ngẫu nhiên k điểm
    const centroids = [];

    for (let i = 0; i < k; i++) centroids.push({ ...points[(i * 9973) % points.length] });

    const buckets = Array.from({ length: k }, () => ({ h: 0, s: 0, v: 0, w: 0 }));
    for (let t = 0; t < iters; t++) {
        for (const p of points) {
            // khoảng cách wrap-around trên Hue
            let best = 0,
                bestd = Infinity;
            for (let c = 0; c < k; c++) {
                const a = centroids[c];
                const dh = Math.min(Math.abs(p.h - a.h), 360 - Math.abs(p.h - a.h)) / 180; // result : 0..1
                const ds = Math.abs(p.s - a.s);
                const dv = Math.abs(p.v - a.v);
                const d = dh * 2 + ds + dv; // ưu tiên Hue
                if (d < bestd) {
                    (bestd = d), (best = c);
                }
            }

            const b = buckets[best];
            b.h += p.h * p.w;
            b.s += p.s * p.w;
            b.v += p.v * p.w;
            b.w += p.w;
        }
    }

    for (let c = 0; c < k; c++) {
        const b = buckets[c];
        if (b.w > 0) {
            centroids[c] = { h: b.h / b.w, s: b.s / b.w, v: b.v / b.w, w: b.w };
        }
    }

    return centroids.map((c) => ({ h: c.h || 0, s: c.s || 0, v: c.v || 0 }));
}

// Tính Sobel + histogram hướng cạnh (8 bins)
function edgeOrientationHist(gray, w, h) {
    const gxk = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const gyk = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    const bins = new Float32Array(EDGE_BINS);

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            let gx = 0,
                gy = 0,
                idx = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const p = gray[(y + ky) * w + (x + kx)];
                    gx += p * gxk[idx];
                    gy += p * gyk[idx];
                    idx++;
                }
            }
            const mag = Math.sqrt(gx * gx + gy * gy);
            if (mag === 0) continue;
            let ang = Math.atan2(gy, gx); // -PI..PI
            if (ang < 0) ang += Math.PI; // 0..PI (hướng không phân biệt ngược)
            const bin = Math.min(EDGE_BINS - 1, Math.floor((ang / Math.PI) * EDGE_BINS));
            bins[bin] += mag;
        }
    }

    // chuẩn hoá
    const sum = bins.reduce((s, v) => s + v, 0) || 1;
    for (let i = 0; i < bins.length; i++) bins[i] /= sum;

    return Buffer.from(new Float32Array(bins).buffer);
}
