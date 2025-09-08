// Dịch vụ tìm kiếm "full": tổng hợp ngữ nghĩa (CLIP), màu sắc (histogram), và hash (dHash)
// Mục tiêu: ưu tiên ngữ nghĩa (giống cách Google xử lý reverse image), sau đó tinh chỉnh bằng màu/hash
const db = require("../config/database");
const hash = require("./hashService");
const colors = require("./colorService");
const clip = require("./clipService");
const ann = require("./annService");
const { computeCenterColorHistograms } = require("../utils/color");
const { analyzeImageQuality, adjustSearchParams } = require("../utils/imageQuality");

// parseBool: ép kiểu giá trị (string/number/boolean) về boolean, có giá trị mặc định
function parseBool(v, fallback = false) {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return !!v;
    if (typeof v !== "string") return fallback;
    return /^(1|true|yes|on)$/i.test(v);
}

// normalizeWeights: chuẩn hoá trọng số 3 kênh (CLIP/Color/Hash) và đảm bảo tổng = 1
// - Nếu người dùng không truyền đủ, áp dụng mặc định (0.65/0.25/0.1)
function normalizeWeights({ clipWeight, colorWeight, hashWeight }) {
    let cw = Number(clipWeight),
        colw = Number(colorWeight),
        hw = Number(hashWeight);
    if (!Number.isFinite(cw) && !Number.isFinite(colw) && !Number.isFinite(hw)) {
        // Tăng trọng số CLIP lên 85% để ưu tiên ngữ nghĩa rất cao, đặc biệt quan trọng với ảnh mờ
        cw = 0.85;
        colw = 0.10;
        hw = 0.05;
    }
    cw = Number.isFinite(cw) ? cw : 0.85;
    colw = Number.isFinite(colw) ? colw : 0.10;
    hw = Number.isFinite(hw) ? hw : 0.05;
    const sum = cw + colw + hw;
    if (sum > 0) {
        cw /= sum;
        colw /= sum;
        hw /= sum;
    }
    return { clipWeight: cw, colorWeight: colw, hashWeight: hw };
}

// buildOptions: tập hợp + chuẩn hoá tham số truy vấn
// - topK: số kết quả cuối cùng trả về
// - minSim: ngưỡng similarity tối thiểu cho CLIP
// - combine: cách trộn điểm (weighted | lexi)
// - lexiEps: ngưỡng sai khác khi so lexi (ưu tiên CLIP rồi Color rồi Hash)
// - restrictToClip: (mặc định true) chỉ tính Color/Hash trên tập ứng viên CLIP để ưu tiên ngữ nghĩa
// - colorVariant: "multi" dùng global + crop trung tâm, "global" chỉ global histogram
// - clipCand/colorCand/hashCand: số lượng ứng viên trung gian cho mỗi kênh
// - weights: trọng số của 3 kênh sau khi chuẩn hoá
function buildOptions(q = {}) {
    const topK = Number.isFinite(Number(q.topK)) ? Number(q.topK) : 20;
    // Giảm minSim để hỗ trợ ảnh chất lượng kém, mờ
    const minSim = Number.isFinite(Number(q.minSim)) ? Number(q.minSim) : 0.15;
    const combine = (q.combine || "weighted").toLowerCase();
    const lexiEps = Number.isFinite(Number(q.lexiEps)) ? Number(q.lexiEps) : 0.02;
    // Mặc định true để ưu tiên ngữ nghĩa giống hành vi Google reverse image
    const restrictToClip = parseBool(q.restrictToClip, true);
    const colorVariant = (q.colorVariant || "multi").toLowerCase();
    const weights = normalizeWeights(q);
    // Giữ số ứng viên ở mức hợp lý để đảm bảo hiệu năng
    const clipCand = Math.max(100, topK * 5);
    const colorCand = Math.max(60, topK * 3);
    const hashCand = Math.max(60, topK * 3);
    // Fallback để không bỏ sót match theo hash/color khi CLIP gating quá chặt
    const ensureHashFallback = parseBool(q.ensureHashFallback, true);
    const ensureColorFallback = parseBool(q.ensureColorFallback, true);
    // Fallback hợp lý để không bỏ sót nhưng vẫn nhanh
    const hashFallback = Number.isFinite(Number(q.hashFallback)) ? Number(q.hashFallback) : Math.min(80, Math.max(30, Math.floor(hashCand * 0.5)));
    const colorFallback = Number.isFinite(Number(q.colorFallback)) ? Number(q.colorFallback) : Math.min(60, Math.max(24, Math.floor(colorCand * 0.5)));
    // Ưu tiên các match hash rất mạnh (near-duplicate)
    const hashStrongThreshold = Number.isFinite(Number(q.hashStrongThreshold)) ? Number(q.hashStrongThreshold) : 6;
    // Giới hạn kích thước mẫu khi fallback quét toàn bộ để đảm bảo < 1.7s
    const fallbackHashSample = Number.isFinite(Number(q.fallbackHashSample)) ? Number(q.fallbackHashSample) : 5000;
    const fallbackColorSample = Number.isFinite(Number(q.fallbackColorSample)) ? Number(q.fallbackColorSample) : 3000;
    return { topK, minSim, combine, lexiEps, restrictToClip, colorVariant, clipCand, colorCand, hashCand, ensureHashFallback, ensureColorFallback, hashFallback, colorFallback, hashStrongThreshold, fallbackHashSample, fallbackColorSample, ...weights };
}

// toScoreEntry: chuẩn hoá các khoảng cách/điểm từng kênh thành score tổng hợp
// - clipSim: [0..1] càng lớn càng tốt -> chuyển về clipDist = 1 - clipSim để đồng nhất (nhỏ hơn tốt hơn)
// - colorDist ~ [0..2] (chi-square) -> chuẩn hoá về [0..1]
// - hashDist ~ [0..64] (Hamming) -> chuẩn hoá về [0..1]
// - score = w_clip*clipDist + w_color*color + w_hash*hash
// - Thêm boost cho CLIP similarity cao
function toScoreEntry(base, clipSim, colorDist, hashDist, weights) {
    const clipDist = 1 - Math.max(0, Math.min(1, clipSim || 0));
    const cRaw = Number.isFinite(colorDist) ? colorDist : 2.0;
    const colorN = Math.min(1, Math.max(0, cRaw / 2.0));
    const hRaw = Number.isFinite(hashDist) ? hashDist : 64;
    const hashN = Math.min(1, Math.max(0, hRaw / 64));
    
    let score = weights.clipWeight * clipDist + weights.colorWeight * colorN + weights.hashWeight * hashN;
    
    // Boost cho CLIP similarity cao: nếu CLIP sim >= 0.7, giảm score (tốt hơn)
    const clipSimValue = clipSim || 0;
    if (clipSimValue >= 0.7) {
        const boost = (clipSimValue - 0.7) * 0.5; // Boost factor từ 0 đến 0.15
        score = score * (1 - boost); // Giảm score (score thấp = rank cao hơn)
    }
    
    return {
        ...base,
        clipSimilarity: Number((clipSim || 0).toFixed(6)),
        colorDistance: Number.isFinite(colorDist) ? Number(cRaw.toFixed(6)) : null,
        hashDistance: Number.isFinite(hashDist) ? hRaw : null,
        score: Number(score.toFixed(6)),
        _clipDist: clipDist,
        _colorDist: colorN,
        _hashDist: hashN,
    };
}

// lexiCompare: so sánh theo thứ tự ưu tiên (CLIP -> Color -> Hash), dùng khi combine = "lexi"
function lexiCompare(a, b, eps = 0.02) {
    const dc = a._clipDist - b._clipDist;
    if (Math.abs(dc) > eps) return dc;
    const d2 = a._colorDist - b._colorDist;
    if (Math.abs(d2) > eps) return d2;
    const d3 = a._hashDist - b._hashDist;
    if (Math.abs(d3) > eps) return d3;
    return a.score - b.score;
}

// clipCandidatesFromVector: sinh ứng viên theo ngữ nghĩa từ vector CLIP
// - Ưu tiên dùng ANN nếu có để nhanh, nếu không thì quét toàn bộ embedding
// - Lọc theo minSim và cắt còn clipCand
async function clipCandidatesFromVector(qVec, opts) {
    let results = [];
    if (ann.isAvailable()) {
        results = await ann.annSearch(qVec, opts.clipCand);
    }
    if (!results || results.length === 0) {
        const [rows] = await db.execute(
            `SELECT e.image_id, e.embedding, i.filename, i.original_name, i.title, i.description
              FROM image_embeddings e JOIN images i ON i.id = e.image_id WHERE e.model = ?`,
            [clip.MODEL_ID]
        );
        results = rows
            .map((r) => {
                const emb = JSON.parse(r.embedding);
                const sim = clip.cosineSimilarity(qVec, emb);
                return {
                    imageId: r.image_id,
                    url: `/uploads/images/${r.filename}`,
                    filename: r.filename,
                    original_name: r.original_name,
                    title: r.title,
                    description: r.description,
                    similarity: Number(sim.toFixed(6)),
                };
            })
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, opts.clipCand);
    }
    return results.filter((r) => r.similarity >= opts.minSim);
}

// colorDistancesForCandidates: tính khoảng cách màu giữa ảnh truy vấn và ứng viên
// - Dùng histogram toàn cục + (tuỳ chọn) histogram vùng trung tâm để tăng độ ổn định
// - Nếu restrictIds có giá trị: chỉ tính trên tập ứng viên đã được lọc bởi CLIP
async function colorDistancesForCandidates(qBufferOrPath, opts, restrictIds = null) {
    // Tập histogram của ảnh truy vấn (qHists):
    // - Bao gồm histogram toàn cục (global)
    // - Nếu chọn "multi": bổ sung các histogram ở vùng trung tâm (crop 80/60/40%)
    //   Lý do: một ảnh có thể có chủ thể ở trung tâm; so khớp theo nhiều vùng giúp ổn định hơn
    const qHists = [];
    const { vector, bins } = await colors.computeColorHistogram(qBufferOrPath);
    qHists.push({ variant: "global", bins, vector });
    if (opts.colorVariant !== "global") {
        const centers = await computeCenterColorHistograms(qBufferOrPath, [0.8, 0.6, 0.4]);
        for (const c of centers) qHists.push(c);
    }
    let rows = [];
    // Nếu restrictIds có dữ liệu: chỉ lấy màu của các ảnh ứng viên đã được lọc bởi CLIP
    if (restrictIds && restrictIds.size > 0) {
        const ids = Array.from(restrictIds);
        const placeholders = ids.map(() => "?").join(",");
        if (opts.colorVariant === "global") {
            const res = await db.execute(
                `SELECT ic.image_id, ic.variant, ic.histogram, i.filename, i.original_name, i.title, i.description
                  FROM image_colors ic JOIN images i ON i.id = ic.image_id
                  WHERE ic.variant = 'global' AND ic.image_id IN (${placeholders})`,
                ids
            );
            rows = res[0];
        } else {
            const res = await db.execute(
                `SELECT ic.image_id, ic.variant, ic.histogram, i.filename, i.original_name, i.title, i.description
                  FROM image_colors ic JOIN images i ON i.id = ic.image_id
                  WHERE ic.image_id IN (${placeholders})`,
                ids
            );
            rows = res[0];
        }
    } else {
        if (opts.colorVariant === "global") {
            const res = await db.execute(
                `SELECT ic.image_id, ic.variant, ic.histogram, i.filename, i.original_name, i.title, i.description
                  FROM image_colors ic JOIN images i ON i.id = ic.image_id WHERE ic.variant = 'global'`
            );
            rows = res[0];
        } else {
            const res = await db.execute(
                `SELECT ic.image_id, ic.variant, ic.histogram, i.filename, i.original_name, i.title, i.description
                  FROM image_colors ic JOIN images i ON i.id = ic.image_id`
            );
            rows = res[0];
        }
    }
    const byImage = new Map();
    for (const r of rows) {
        const hist = JSON.parse(r.histogram);
        // Vòng lặp lồng nhau (nested loops):
        // - Outer loop: duyệt từng bản ghi màu của ứng viên (mỗi ảnh có thể có nhiều variant: global/center...)
        // - Inner loop: so sánh histogram của ứng viên hiện tại với TẤT CẢ histogram truy vấn (qHists)
        //   -> lấy khoảng cách nhỏ nhất (best) để thể hiện mức gần màu tốt nhất giữa ứng viên và ảnh truy vấn
        let best = Infinity;
        for (const q of qHists) {
            const d = colors.chiSquareDistance(q.vector, hist);
            if (d < best) best = d;
        }
        // Gom kết quả theo ảnh (image_id): lưu lại bestColor nhỏ nhất qua mọi variant của ảnh đó
        const entry = byImage.get(r.image_id) || {
            image_id: r.image_id,
            url: `/uploads/images/${r.filename}`,
            filename: r.filename,
            original_name: r.original_name,
            title: r.title,
            description: r.description,
            bestColor: Infinity,
        };
        if (best < entry.bestColor) entry.bestColor = best;
        byImage.set(r.image_id, entry);
    }
    // Chuyển map -> mảng kết quả, chuẩn hoá số liệu và sort tăng dần theo khoảng cách màu
    // Lấy top colorCand ứng viên màu sát nhất
    return Array.from(byImage.values())
        .map((it) => ({ imageId: it.image_id, url: it.url, filename: it.filename, original_name: it.original_name, title: it.title, description: it.description, colorDistance: Number(it.bestColor.toFixed(6)) }))
        .sort((a, b) => a.colorDistance - b.colorDistance)
        .slice(0, opts.colorCand);
}

// hashDistancesForCandidates: tính khoảng cách hash (dHash) giữa ảnh truy vấn và ứng viên
// - Kết hợp global hash + tile hash + overlapping tile để bắt chi tiết cục bộ
// - Nếu restrictIds có giá trị: chỉ tính trên tập ứng viên đã được lọc bởi CLIP
async function hashDistancesForCandidates(qBufferOrPath, opts, restrictIds = null) {
    const queryHashes = [];
    const globalHash = await hash.computeDHashHex(qBufferOrPath);
    queryHashes.push(globalHash);
    for (const g of [3, 4, 5]) {
        const t = await hash.computeTileDHashes(qBufferOrPath, g);
        for (const h of t) queryHashes.push(h);
    }
    const overlapHashes = await hash.computeOverlappingTileDHashes(qBufferOrPath, 4, 0.5);
    for (const h of overlapHashes) queryHashes.push(h);

    let rows = [];
    if (restrictIds && restrictIds.size > 0) {
        const ids = Array.from(restrictIds);
        const placeholders = ids.map(() => "?").join(",");
        const res = await db.execute(
            `SELECT ih.image_id, ih.tile_index, ih.hash, i.filename, i.original_name, i.title, i.description
              FROM image_hashes ih JOIN images i ON i.id = ih.image_id
              WHERE ih.image_id IN (${placeholders})`,
            ids
        );
        rows = res[0];
    } else {
        const res = await db.execute(
            `SELECT ih.image_id, ih.tile_index, ih.hash, i.filename, i.original_name, i.title, i.description
              FROM image_hashes ih JOIN images i ON i.id = ih.image_id`
        );
        rows = res[0];
    }

    const byImage = new Map();
    for (const r of rows) {
        let bestForRow = Infinity;
        for (const qh of queryHashes) {
            const d = hash.hammingDistanceHex(qh, r.hash);
            if (d < bestForRow) bestForRow = d;
            if (bestForRow === 0) break;
        }
        const entry = byImage.get(r.image_id) || {
            image_id: r.image_id,
            url: `/uploads/images/${r.filename}`,
            filename: r.filename,
            original_name: r.original_name,
            title: r.title,
            description: r.description,
            bestDistance: Infinity,
        };
        if (bestForRow < entry.bestDistance) entry.bestDistance = bestForRow;
        byImage.set(r.image_id, entry);
    }
    return Array.from(byImage.values())
        .map((it) => ({ imageId: it.image_id, url: it.url, filename: it.filename, original_name: it.original_name, title: it.title, description: it.description, hashDistance: it.bestDistance }))
        .sort((a, b) => a.hashDistance - b.hashDistance)
        .slice(0, opts.hashCand);
}

// searchFullWithBuffer: pipeline full cho ảnh truy vấn từ buffer
// 1) Phân tích chất lượng ảnh và điều chỉnh tham số
// 2) Tính CLIP -> tạo ứng viên ngữ nghĩa
// 3) Tính Color/Hash (mặc định chỉ trên tập ứng viên CLIP)
// 4) Chuẩn hoá và trộn điểm theo weighted|lexi, trả về topK
async function searchFullWithBuffer(buffer, query = {}) {
    // Phân tích chất lượng ảnh trước
    const qualityAnalysis = await analyzeImageQuality(buffer);
    console.log("Image quality analysis:", qualityAnalysis);
    
    // Điều chỉnh tham số dựa trên chất lượng ảnh
    const adjustedQuery = adjustSearchParams(query, qualityAnalysis);
    const opts = buildOptions(adjustedQuery);
    const outInfo = {
        topK: opts.topK,
        weights: { clipWeight: opts.clipWeight, colorWeight: opts.colorWeight, hashWeight: opts.hashWeight },
        minSim: opts.minSim,
        combine: opts.combine,
        lexiEps: opts.lexiEps,
        restrictToClip: opts.restrictToClip,
        colorVariant: opts.colorVariant,
    };

    // CLIP
    let qVec = null;
    try {
        qVec = await clip.computeClipEmbedding(buffer);
        console.log("CLIP embedding computed successfully, vector length:", qVec ? qVec.length : 0);
    } catch (e) {
        console.error("CLIP embedding failed:", e);
        /* ignore */
    }
    const candidates = new Map();
    const clipIdSet = new Set();
    if (qVec) {
        try {
            const clipRes = await clipCandidatesFromVector(qVec, opts);
            console.log("CLIP candidates found:", clipRes.length);
            for (const r of clipRes) {
                candidates.set(r.imageId, { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description, clipSimilarity: r.similarity });
                clipIdSet.add(r.imageId);
            }
            // Log top 3 CLIP results for debugging
            const top3 = clipRes.slice(0, 3);
            console.log("Top 3 CLIP candidates:", top3.map(r => ({ 
                imageId: r.imageId, 
                filename: r.filename, 
                similarity: r.similarity,
                title: r.title 
            })));
        } catch (e) {
            console.error("CLIP search error:", e);
            /* ignore */
        }
    }

    // Color
    try {
        const colorRes = await colorDistancesForCandidates(buffer, opts, opts.restrictToClip ? clipIdSet : null);
        console.log("Color candidates found:", colorRes.length);
        for (const r of colorRes) {
            const prev = candidates.get(r.imageId) || { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description };
            prev.colorDistance = r.colorDistance;
            candidates.set(r.imageId, prev);
        }
        // Fallback: luôn thêm một nhóm nhỏ ứng viên màu tốt nhất toàn kho nếu đang restrict theo CLIP
        if (opts.restrictToClip && opts.ensureColorFallback) {
            const fallbackRes = await colorDistancesForCandidates(buffer, { ...opts, colorCand: opts.colorFallback }, null);
            console.log("Color fallback candidates:", fallbackRes.length);
            for (const r of fallbackRes) {
                const prev = candidates.get(r.imageId) || { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description };
                if (prev.colorDistance == null || r.colorDistance < prev.colorDistance) prev.colorDistance = r.colorDistance;
                candidates.set(r.imageId, prev);
            }
        }
        
        // Nếu CLIP không cho kết quả tốt, mở rộng search bằng color
        if (clipIdSet.size < 10) {
            console.log("Low CLIP candidates, expanding with color search");
            const expandedColorRes = await colorDistancesForCandidates(buffer, { ...opts, colorCand: Math.max(opts.colorCand, 100) }, null);
            for (const r of expandedColorRes.slice(0, 50)) {
                const prev = candidates.get(r.imageId) || { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description };
                if (prev.colorDistance == null || r.colorDistance < prev.colorDistance) prev.colorDistance = r.colorDistance;
                candidates.set(r.imageId, prev);
            }
        }
    } catch (e) {
        console.error("Color search error:", e);
        /* ignore */
    }

    // Hash
    try {
        const hashRes = await hashDistancesForCandidates(buffer, opts, opts.restrictToClip ? clipIdSet : null);
        console.log("Hash candidates found:", hashRes.length);
        for (const r of hashRes) {
            const prev = candidates.get(r.imageId) || { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description };
            prev.hashDistance = r.hashDistance;
            candidates.set(r.imageId, prev);
        }
        if (opts.restrictToClip && opts.ensureHashFallback) {
            const fallbackRes = await hashDistancesForCandidates(buffer, { ...opts, hashCand: opts.hashFallback }, null);
            console.log("Hash fallback candidates:", fallbackRes.length);
            for (const r of fallbackRes) {
                const prev = candidates.get(r.imageId) || { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description };
                if (prev.hashDistance == null || r.hashDistance < prev.hashDistance) prev.hashDistance = r.hashDistance;
                candidates.set(r.imageId, prev);
            }
        }
        
        // Nếu CLIP không cho kết quả tốt, mở rộng search bằng hash
        if (clipIdSet.size < 10) {
            console.log("Low CLIP candidates, expanding with hash search");
            const expandedHashRes = await hashDistancesForCandidates(buffer, { ...opts, hashCand: Math.max(opts.hashCand, 100) }, null);
            for (const r of expandedHashRes.slice(0, 50)) {
                const prev = candidates.get(r.imageId) || { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description };
                if (prev.hashDistance == null || r.hashDistance < prev.hashDistance) prev.hashDistance = r.hashDistance;
                candidates.set(r.imageId, prev);
            }
        }
    } catch (e) {
        console.error("Hash search error:", e);
        /* ignore */
    }

    let scored = Array.from(candidates.values()).map((r) => toScoreEntry(r, r.clipSimilarity, r.colorDistance, r.hashDistance, opts));
    
    // Ưu tiên các match CLIP similarity rất cao (>= 0.7) lên trước
    const highClipMatches = scored
        .filter((x) => x.clipSimilarity >= 0.7)
        .sort((a, b) => b.clipSimilarity - a.clipSimilarity || a.score - b.score);
    
    // Ưu tiên các match hash rất mạnh (near-duplicate) nhưng không có CLIP cao
    const strong = scored
        .filter((x) => x.clipSimilarity < 0.7 && Number.isFinite(x.hashDistance) && x.hashDistance <= opts.hashStrongThreshold)
        .sort((a, b) => a.hashDistance - b.hashDistance || (a._clipDist - b._clipDist));
    const rest = scored
        .filter((x) => x.clipSimilarity < 0.7 && !(Number.isFinite(x.hashDistance) && x.hashDistance <= opts.hashStrongThreshold))
        .sort((a, b) => (opts.combine === "lexi" ? lexiCompare(a, b, opts.lexiEps) : a.score - b.score));
    
    // Sắp xếp cuối cùng: High CLIP matches -> Strong hash matches -> Rest
    const merged = [...highClipMatches, ...strong, ...rest].slice(0, opts.topK);
    
    // Debug logging
    console.log("Final search results summary:");
    console.log(`- Total candidates processed: ${candidates.size}`);
    console.log(`- High CLIP matches (>= 0.7): ${highClipMatches.length}`);
    console.log(`- Strong hash matches: ${strong.length}`);
    console.log(`- Regular matches: ${rest.length}`);
    console.log(`- Returned top ${merged.length} results`);
    if (merged.length > 0) {
        console.log("Top 5 final results:");
        merged.slice(0, 5).forEach((r, i) => {
            console.log(`  ${i+1}. ${r.filename} - Score: ${r.score}, CLIP: ${r.clipSimilarity || 'N/A'}, Color: ${r.colorDistance || 'N/A'}, Hash: ${r.hashDistance || 'N/A'}`);
        });
    }
    
    return { results: merged, info: { ...outInfo, qualityAnalysis } };
}

// searchFullByImageId: pipeline full cho ảnh đã tồn tại trong DB (theo id)
// - Tận dụng embedding đã lưu (hoặc tính + lưu nếu thiếu) để tiết kiệm thời gian
// - Loại bỏ ảnh gốc khỏi kết quả
async function searchFullByImageId(imageId, query = {}) {
    const opts = buildOptions(query);
    const outInfo = {
        topK: opts.topK,
        weights: { clipWeight: opts.clipWeight, colorWeight: opts.colorWeight, hashWeight: opts.hashWeight },
        minSim: opts.minSim,
        combine: opts.combine,
        lexiEps: opts.lexiEps,
        restrictToClip: opts.restrictToClip,
        colorVariant: opts.colorVariant,
    };

    // Prepare CLIP qVec for this image (reuse stored embedding if available)
    let qVec = null;
    try {
        const [embRows] = await db.execute("SELECT dim, embedding FROM image_embeddings WHERE image_id = ? AND model = ? LIMIT 1", [imageId, clip.MODEL_ID]);
        if (embRows?.length) qVec = JSON.parse(embRows[0].embedding);
        if (!qVec) {
            const [[imgRow]] = await db.execute("SELECT file_path FROM images WHERE id = ? LIMIT 1", [imageId]);
            if (!imgRow) throw new Error("Image not found");
            qVec = await clip.computeClipEmbedding(imgRow.file_path);
            await db.execute("INSERT INTO image_embeddings (image_id, model, dim, embedding) VALUES (?, ?, ?, ?)", [imageId, clip.MODEL_ID, qVec.length, JSON.stringify(qVec)]);
            ann.invalidate();
        }
    } catch (e) {
        /* ignore */
    }

    const candidates = new Map();
    const clipIdSet = new Set();
    if (qVec) {
        try {
            let clipRes = [];
            if (ann.isAvailable()) clipRes = await ann.annSearch(qVec, opts.clipCand + 1);
            if (!clipRes || clipRes.length === 0) {
                const [rows] = await db.execute(
                    `SELECT e.image_id, e.embedding, i.filename, i.original_name, i.title, i.description
                      FROM image_embeddings e JOIN images i ON i.id = e.image_id WHERE e.model = ? AND e.image_id <> ?`,
                    [clip.MODEL_ID, imageId]
                );
                clipRes = rows
                    .map((r) => {
                        const emb = JSON.parse(r.embedding);
                        const sim = clip.cosineSimilarity(qVec, emb);
                        return { imageId: r.image_id, url: `/uploads/images/${r.filename}`, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description, similarity: Number(sim.toFixed(6)) };
                    })
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, opts.clipCand + 1);
            }
            for (const r of clipRes) {
                if (r.imageId === imageId) continue;
                if (r.similarity < opts.minSim) continue;
                candidates.set(r.imageId, { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description, clipSimilarity: r.similarity });
                clipIdSet.add(r.imageId);
            }
        } catch (e) {
            /* ignore */
        }
    }

    // Color distances (restrict to CLIP candidates if requested)
    try {
        const [[imgRow2]] = await db.execute("SELECT file_path FROM images WHERE id = ? LIMIT 1", [imageId]);
        if (imgRow2) {
            const colorRes = await colorDistancesForCandidates(imgRow2.file_path, opts, opts.restrictToClip ? clipIdSet : null);
            for (const r of colorRes) {
                if (r.imageId === imageId) continue;
                const prev = candidates.get(r.imageId) || { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description };
                prev.colorDistance = r.colorDistance;
                candidates.set(r.imageId, prev);
            }
            // Fallback: bổ sung top màu toàn kho nếu đang restrict theo CLIP
            if (opts.restrictToClip && opts.ensureColorFallback) {
                const fallbackRes = await colorDistancesForCandidates(imgRow2.file_path, { ...opts, colorCand: opts.colorFallback }, null);
                for (const r of fallbackRes) {
                    if (r.imageId === imageId) continue;
                    const prev = candidates.get(r.imageId) || { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description };
                    if (prev.colorDistance == null || r.colorDistance < prev.colorDistance) prev.colorDistance = r.colorDistance;
                    candidates.set(r.imageId, prev);
                }
            }
        }
    } catch (e) {
        /* ignore */
    }

    // Hash distances (restrict to CLIP candidates if requested)
    try {
        const [[imgRow3]] = await db.execute("SELECT file_path FROM images WHERE id = ? LIMIT 1", [imageId]);
        if (imgRow3) {
            const hashRes = await hashDistancesForCandidates(imgRow3.file_path, opts, opts.restrictToClip ? clipIdSet : null);
            for (const r of hashRes) {
                if (r.imageId === imageId) continue;
                const prev = candidates.get(r.imageId) || { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description };
                prev.hashDistance = r.hashDistance;
                candidates.set(r.imageId, prev);
            }
            if (opts.restrictToClip && opts.ensureHashFallback) {
                const fallbackRes = await hashDistancesForCandidates(imgRow3.file_path, { ...opts, hashCand: opts.hashFallback }, null);
                for (const r of fallbackRes) {
                    if (r.imageId === imageId) continue;
                    const prev = candidates.get(r.imageId) || { imageId: r.imageId, url: r.url, filename: r.filename, original_name: r.original_name, title: r.title, description: r.description };
                    if (prev.hashDistance == null || r.hashDistance < prev.hashDistance) prev.hashDistance = r.hashDistance;
                    candidates.set(r.imageId, prev);
                }
            }
        }
    } catch (e) {
        /* ignore */
    }
    // Build scored list for by-id
    let scored = Array.from(candidates.values()).map((r) => toScoreEntry(r, r.clipSimilarity, r.colorDistance, r.hashDistance, opts));

    // Ưu tiên các match CLIP similarity rất cao (>= 0.7) lên trước
    const highClipMatches = scored
        .filter((x) => x.clipSimilarity >= 0.7)
        .sort((a, b) => b.clipSimilarity - a.clipSimilarity || a.score - b.score);

    const strong = scored
        .filter((x) => x.clipSimilarity < 0.7 && Number.isFinite(x.hashDistance) && x.hashDistance <= opts.hashStrongThreshold)
        .sort((a, b) => a.hashDistance - b.hashDistance || (a._clipDist - b._clipDist));
    const rest = scored
        .filter((x) => x.clipSimilarity < 0.7 && !(Number.isFinite(x.hashDistance) && x.hashDistance <= opts.hashStrongThreshold))
        .sort((a, b) => (opts.combine === "lexi" ? lexiCompare(a, b, opts.lexiEps) : a.score - b.score));
    
    return { results: [...highClipMatches, ...strong, ...rest].slice(0, opts.topK), info: outInfo };
}

module.exports = {
    buildOptions,
    searchFullWithBuffer,
    searchFullByImageId,
};
