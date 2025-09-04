import crypto from "node:crypto";
import fs from "node:fs/promises";
import sharp from "sharp";

const H_BINS = 36;
const S_BINS = 8;
const V_BINS = 8;
const EDGE_BINS = 8;
const DOM_COLORS = 5;

// checksum sha256 file name (đơn giản)
function sha256(s) {
    return crypto.createHash("sha256").update(s).digest("hex");
}

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
function luma(r, g, b) {
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

// Histogram HSV 3D
function hsvHist(rgb, w, h) {
    const hist = new Float32Array(H_BINS * S_BINS * V_BINS);
    const gray = new Float32Array(w * h);
    let px = 0;
    for (let i = 0; i < rgb.length; i += 3, px++) {
        const r = rgb[i],
            g = rgb[i + 1],
            b = rgb[i + 2];
        const [hh, ss, vv] = rgbToHsv(r, g, b);

        const hb = Math.min(H_BINS - 1, Math.floor(hh / (360 / H_BINS)));
        const sb = Math.min(S_BINS - 1, Math.floor(ss * S_BINS));
        const vb = Math.min(V_BINS - 1, Math.floor(vv * V_BINS));
        hist[hb * S_BINS * V_BINS + sb * V_BINS + vb] += 1;
        gray[px] = luma(r, g, b);
    }

    // chuẩn hoá histogram (sau khi duyệt hết pixel)
    const total = w * h;
    for (let j = 0; j < hist.length; j++) hist[j] /= total;

    // buffer float32 LE
    const histBuf = Buffer.from(new Float32Array(hist).buffer);

    // dominant hue (bin nhiều nhất)
    let maxv = -1,
        dominantHueBin = 0;
    for (let j = 0; j < H_BINS; j++) {
        // sum theo H bin j qua tất cả S,V
        let sum = 0;
        for (let s = 0; s < S_BINS; s++) {
            for (let v = 0; v < V_BINS; v++) {
                sum += hist[j * S_BINS * V_BINS + s * V_BINS + v];
            }
        }
        if (sum > maxv) {
            maxv = sum;
            dominantHueBin = j;
        }
    }

    return { histBuf, gray, dominantHueBin };
}

// Lưới 3x3 luminance
function thirdsGrid(gray, w, h) {
    const gx = [0, Math.floor(w / 3), Math.floor((2 * w) / 3), w];
    const gy = [0, Math.floor(h / 3), Math.floor((2 * h) / 3), h];
    const cells = new Float32Array(3 * 3); // 9

    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            let sum = 0,
                cnt = 0;
            for (let y = gy[r]; y < gy[r + 1]; y++) {
                const off = y * w;
                for (let x = gx[c]; x < gx[c + 1]; x++) {
                    sum += gray[off + x];
                    cnt++;
                }
            }
            cells[r * 3 + c] = cnt ? sum / (cnt * 255) : 0; // chuẩn hóa 0..1
        }
    }

    return Buffer.from(new Float32Array(cells).buffer);
}

// Dominant colors bằng kmeans HSV
function dominantColors(pts, k = DOM_COLORS) {
    const cents = kmeansHSV(pts, k, 8);
    const arr = new Float32Array(k * 3);

    for (let i = 0; i < k; i++) {
        const { h, s, v } = cents[i];
        arr[i * 3 + 0] = h; // lưu h theo độ (0..360)
        arr[i * 3 + 1] = s; // 0..1
        arr[i * 3 + 2] = v; // 0..1
    }

    return Buffer.from(arr.buffer);
}

// aspect bucket
function aspectBucket(w, h) {
    const r = w / h;
    if (r < 0.95) return 1;
    if (r > 1.05) return 3;
    return 2;
}

export async function extractFeaturesFromFile(filePath, maxDim = 256) {
    const img = sharp(filePath).removeAlpha().rotate(); // auto-orient
    const { data, info } = await img.resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true }); // data: Uint8Array RGB, info: {width,height,channels}
    const w = info.width,
        h = info.height;

    // HSV hist + gray + dominant hue
    const { histBuf, gray, dominantHueBin } = hsvHist(data, w, h);

    // thirds grid 3x3
    const thirdsBuf = thirdsGrid(gray, w, h);

    // edge orientation hist
    const edgeBuf = edgeOrientationHist(gray, w, h);

    // dominant colors
    // tạo lại pts nhanh từ gray/hist pass 2 (đơn giản lấy sample)
    const pts = [];
    for (let i = 0; i < data.length; i += 3 * 4) {
        // sample mỗi 4 pixels
        const r = data[i],
            g = data[i + 1],
            b = data[i + 2];
        const [hh, ss, vv] = rgbToHsv(r, g, b);
        pts.push({ h: hh, s: ss, v: vv, w: vv + 1e-3 });
    }
    const domBuf = dominantColors(pts, DOM_COLORS);

    // metadata thực tế của file gốc
    const stat = await fs.stat(filePath);
    const meta = await sharp(filePath).metadata();
    const arBucket = aspectBucket(meta.width || w, meta.height || h);

    return {
        hsv_hist: histBuf,
        thirds_grid_3x3: thirdsBuf,
        edge_orient_hist: edgeBuf,
        dominant_colors: domBuf,
        hsv_bins_h: H_BINS,
        hsv_bins_s: S_BINS,
        hsv_bins_v: V_BINS,
        edge_bins: EDGE_BINS,
        dominant_color_count: DOM_COLORS,
        dominant_hue_bin: dominantHueBin,
        width: meta.width || w,
        height: meta.height || h,
        file_size: stat.size,
        aspect_ratio_bucket: arBucket,
    };
}
