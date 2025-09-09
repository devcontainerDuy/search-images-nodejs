// server.js
import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";

import cvReady from "@techstark/opencv-js";
import { Image } from "image-js";
import { pipeline, env } from "@huggingface/transformers";
import cosine from "cosine-similarity";

const app = express();
app.use(express.json());

/** ====== Config ====== */
const PRODUCT_DIR = path.resolve("./uploads/products");
const STORE_DIR = path.resolve("./store");
const FEATURES_BIN = path.join(STORE_DIR, "features.bin");
const PATHS_JSON = path.join(STORE_DIR, "paths.json");
const META_JSON = path.join(STORE_DIR, "metadata.json");

env.cacheDir = path.resolve("./.cache");
const MODEL_ID = "Xenova/clip-vit-base-patch32"; // tương đương ViT-B/32
let AUGMENTATION_ENABLED = true;

/** ====== Globals (in-memory index) ====== */
let imagePaths = []; // string[]
let imageFeatures = null; // Float32Array (concat of 512-d vectors)
let productMeta = {}; // { [filename]: {...} }
const D = 512; // CLIP dim

/** ====== Utils: binary store ====== */
async function ensureDirs() {
    for (const d of [PRODUCT_DIR, STORE_DIR, env.cacheDir]) {
        await fs.mkdir(d, { recursive: true });
    }
}

async function saveIndex() {
    // imageFeatures: Float32Array length = N*D
    if (!imageFeatures) return;
    await fs.writeFile(FEATURES_BIN, Buffer.from(imageFeatures.buffer));
    await fs.writeFile(PATHS_JSON, JSON.stringify(imagePaths, null, 2), "utf-8");
    await fs.writeFile(META_JSON, JSON.stringify(productMeta, null, 2), "utf-8");
}

async function loadIndex() {
    try {
        const [pathsRaw, metaRaw] = await Promise.all([fs.readFile(PATHS_JSON, "utf-8"), fs.readFile(META_JSON, "utf-8").catch(() => "{}")]);
        imagePaths = JSON.parse(pathsRaw);
        productMeta = JSON.parse(metaRaw || "{}");

        const stat = await fs.stat(FEATURES_BIN);
        const buf = await fs.readFile(FEATURES_BIN);
        // reconstruct Float32Array
        imageFeatures = new Float32Array(buf.buffer, buf.byteOffset, stat.size / 4);
        console.log(`Loaded index: ${imagePaths.length} images, feats=${imageFeatures.length / D}x${D}`);
    } catch {
        console.log("Index not found. Need rebuild.");
        imagePaths = [];
        productMeta = {};
        imageFeatures = null;
    }
}

/** ====== OpenCV helpers (augmentation giống Python) ====== */
async function applyAugmentations(img) {
    // img: image-js Image (RGBA)
    if (!AUGMENTATION_ENABLED) return [img];

    const cv = await cvReady;
    const rgba = img.getRGBAData({ clamped: true });
    const mat = cv.matFromImageData({ data: rgba, width: img.width, height: img.height });
    const bgr = new cv.Mat();
    cv.cvtColor(mat, bgr, cv.COLOR_RGBA2BGR);

    const aug = [];

    // base
    aug.push(img);

    // 1) CLAHE
    const lab = new cv.Mat();
    cv.cvtColor(bgr, lab, cv.COLOR_BGR2Lab);
    const planes = new cv.MatVector();
    cv.split(lab, planes);
    const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));
    const L = planes.get(0);
    const L2 = new cv.Mat();
    clahe.apply(L, L2);
    planes.set(0, L2);
    const lab2 = new cv.Mat();
    cv.merge(planes, lab2);
    const claheBGR = new cv.Mat();
    cv.cvtColor(lab2, claheBGR, cv.COLOR_Lab2BGR);
    aug.push(await matToImageJs(cv, claheBGR, img.width, img.height));

    // 2) global equalize
    const yuv = new cv.Mat();
    cv.cvtColor(bgr, yuv, cv.COLOR_BGR2YUV);
    const ch = new cv.MatVector();
    cv.split(yuv, ch);
    const yEq = new cv.Mat();
    cv.equalizeHist(ch.get(0), yEq);
    ch.set(0, yEq);
    const yuv2 = new cv.Mat();
    cv.merge(ch, yuv2);
    const eqBGR = new cv.Mat();
    cv.cvtColor(yuv2, eqBGR, cv.COLOR_YUV2BGR);
    aug.push(await matToImageJs(cv, eqBGR, img.width, img.height));

    // 3) Gaussian blur (3x3)
    const blur = new cv.Mat();
    cv.GaussianBlur(bgr, blur, new cv.Size(3, 3), 0);
    aug.push(await matToImageJs(cv, blur, img.width, img.height));

    // 4) darker (alpha=0.9)
    const dark = new cv.Mat();
    cv.convertScaleAbs(bgr, dark, 0.9, 0);
    aug.push(await matToImageJs(cv, dark, img.width, img.height));

    // 5) brighter (alpha=1.1, beta=10)
    const bright = new cv.Mat();
    cv.convertScaleAbs(bgr, bright, 1.1, 10);
    aug.push(await matToImageJs(cv, bright, img.width, img.height));

    // cleanup
    [mat, bgr, lab, planes, L, L2, lab2, claheBGR, yuv, ch, yEq, yuv2, eqBGR, blur, dark, bright].forEach(safeDelete);

    return aug;
}

function safeDelete(m) {
    if (m && typeof m.delete === "function") m.delete();
}

async function matToImageJs(cv, mat, w, h) {
    const rgba = new cv.Mat();
    cv.cvtColor(mat, rgba, cv.COLOR_BGR2RGBA);
    const img = Image.fromCanvas({
        // reconstruct via raw data
        width: w,
        height: h,
        data: Buffer.from(rgba.data), // Uint8ClampedArray compatible
    });
    rgba.delete();
    return img;
}

/** ====== CLIP embedding (transformers.js) ====== */
let imageFe = null; // pipeline instance

async function getImagePipeline() {
    if (!imageFe) {
        // Nếu máy bạn hỗ trợ WebGPU, có thể bật device: 'webgpu'
        imageFe = await pipeline("image-feature-extraction", MODEL_ID /* , { device: 'webgpu' } */);
    }
    return imageFe;
}

function l2normalize(arr) {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
    const n = Math.sqrt(s) || 1;
    for (let i = 0; i < arr.length; i++) arr[i] /= n;
    return arr;
}

async function embedImageFile(absPath) {
    const fe = await getImagePipeline();
    // transformers.js trong Node: truyền "file:///abs/path"
    const out = await fe("file://" + absPath);
    const vec = Array.from(out.data); // Float32Array-like
    return Float32Array.from(l2normalize(vec));
}

async function embedImageBytes(buffer) {
    // Viết ra temp file rồi gọi pipeline cho chắc ăn
    const tmp = path.join(os.tmpdir(), `q_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
    await fs.writeFile(tmp, buffer);
    try {
        return await embedImageFile(tmp);
    } finally {
        fs.unlink(tmp).catch(() => {});
    }
}

/** ====== Classic features (tùy – dùng để rerank nếu cần) ====== */
/* Có thể bổ sung HSV hist / edge như trước; ở đây demo chỉ CLIP cho gọn MVP */

/** ====== Build/Rebuild index ====== */
async function rebuild() {
    await ensureDirs();
    const files = (await fs.readdir(PRODUCT_DIR)).filter((f) => f.match(/\.(png|jpe?g|webp)$/i));

    if (!files.length) {
        imagePaths = [];
        imageFeatures = null;
        productMeta = {};
        await saveIndex();
        return { count: 0, secs: 0 };
    }

    const feats = new Float32Array(files.length * D);
    productMeta = {};
    const t0 = Date.now();

    // tuần tự để đơn giản; có thể Promise.allSettled batch 10–20 cái
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const abs = path.join(PRODUCT_DIR, f);
        try {
            // augmentation: lấy trung bình embeddings các phiên bản
            const img = await Image.load(abs);
            const augImgs = await applyAugmentations(img);
            const vecs = [];
            for (const aimg of augImgs) {
                // ghi tạm từng augmentation để pipeline đọc (đơn giản)
                const tmp = path.join(os.tmpdir(), `aug_${Date.now()}_${Math.random()}.png`);
                await aimg.save(tmp); // image-js save PNG
                const v = await embedImageFile(tmp);
                vecs.push(v);
                fs.unlink(tmp).catch(() => {});
            }
            const mean = new Float32Array(D);
            for (const v of vecs) for (let k = 0; k < D; k++) mean[k] += v[k];
            for (let k = 0; k < D; k++) mean[k] /= vecs.length;
            l2normalize(mean);

            feats.set(mean, i * D);

            productMeta[f] = {
                filename: f,
                path: abs,
                size: [img.width, img.height],
                format: img.bitDepth ? `RGBA${img.bitDepth}` : "unknown",
                created: new Date((await fs.stat(abs)).ctimeMs).toISOString(),
            };
        } catch (e) {
            console.warn("Skip", f, e.message);
            // set zero vector để không crash; hoặc loại file khỏi index
            for (let k = 0; k < D; k++) feats[i * D + k] = 0;
        }
    }

    imagePaths = files;
    imageFeatures = feats;

    await saveIndex();

    return { count: files.length, secs: ((Date.now() - t0) / 1000).toFixed(2) };
}

/** ====== Similarity search ====== */
function searchByVector(qVec, { minSim = 0.65, topK = 50 } = {}) {
    if (!imageFeatures || !imagePaths.length) return [];

    const N = imagePaths.length;
    const scores = new Array(N);
    for (let i = 0; i < N; i++) {
        const off = i * D;
        const v = imageFeatures.subarray(off, off + D);
        scores[i] = [i, cosine(qVec, v)]; // cosine-similarity lib
    }
    scores.sort((a, b) => b[1] - a[1]);

    const out = [];
    for (const [idx, s] of scores) {
        if (s < minSim) break;
        out.push({
            image: imagePaths[idx],
            score: +s.toFixed(6),
            image_url: `/uploads/products/${imagePaths[idx]}`,
            metadata: productMeta[imagePaths[idx]] || {},
        });
        if (out.length >= topK) break;
    }
    return out;
}

/** ====== Multer for /search ====== */
const upload = multer({ storage: multer.memoryStorage() });

/** ====== Routes ====== */
app.get("/stats", async (req, res) => {
    res.json({
        total_images: imagePaths.length,
        model: MODEL_ID,
        augmentation_enabled: AUGMENTATION_ENABLED,
        image_folder: PRODUCT_DIR,
    });
});

app.post("/toggle_augmentation", (req, res) => {
    const { enabled } = req.body || {};
    if (typeof enabled === "boolean") {
        AUGMENTATION_ENABLED = enabled;
        return res.json({ status: "success", augmentation_enabled: AUGMENTATION_ENABLED });
    }
    res.status(400).json({ error: "Invalid request" });
});

app.get("/rebuild", async (req, res) => {
    try {
        const r = await rebuild();
        res.json({ status: "success", ...r });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/search", upload.single("image"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No image uploaded" });
        const min_similarity = parseFloat(req.body.min_similarity ?? "0.65");
        const top_k = parseInt(req.body.top_k ?? "50", 10);

        // embed query (không cần augmentation cho tốc độ, nhưng có thể bật nếu muốn)
        const q = await embedImageBytes(req.file.buffer);

        const t0 = Date.now();
        const results = searchByVector(q, { minSim: min_similarity, topK: top_k });
        const total = (Date.now() - t0) / 1000;

        res.json({
            total_results: results.length,
            min_similarity: min_similarity,
            results,
            timing: { total },
            use_augmentation: AUGMENTATION_ENABLED,
            model: MODEL_ID,
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

/** ====== Boot ====== */
const PORT = process.env.PORT || 5000;
(async () => {
    await ensureDirs();
    await loadIndex(); // nếu chưa có thì gọi /rebuild
    app.listen(PORT, () => {
        console.log(`Listening on http://0.0.0.0:${PORT}`);
    });
})();
