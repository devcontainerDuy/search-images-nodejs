const fs = require("fs-extra");
const db = require("../config/database");
const hash = require("../services/hashService");
const colors = require("../services/colorService");
const clip = require("../services/clipService");
const { computeCenterColorHistograms } = require("../utils/color");
const ann = require("../services/annService");

async function searchText(req, res) {
    try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
        const offsetNum = (pageNum - 1) * limitNum;
        let query = "SELECT * FROM images WHERE 1=1";
        const params = [];
        if (q) {
            query += " AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR original_name LIKE ?)";
            const t = `%${q}%`;
            params.push(t, t, t, t);
        }
        query += ` ORDER BY id DESC LIMIT ${offsetNum >= 0 ? offsetNum : 0}, ${limitNum}`;
        const [images] = await db.execute(query, params);

        let countQuery = "SELECT COUNT(*) as total FROM images WHERE 1=1";
        const countParams = [];
        if (q) {
            countQuery += " AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR original_name LIKE ?)";
            const t = `%${q}%`;
            countParams.push(t, t, t, t);
        }
        const [countResult] = await db.execute(countQuery, countParams);
        const total = countResult[0]?.total || 0;
        res.json({
            images: images.map((img) => ({
                ...img,
                url: `/uploads/images/${img.filename}`,
                thumbnail: `/uploads/images/${img.filename}`,
            })),
            pagination: {
                current: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (e) {
        console.error("Search error:", e);
        res.status(500).json({ error: "Lỗi server khi tìm kiếm" });
    }
}

async function downloadImageToBuffer(url) {
    return new Promise((resolve, reject) => {
        try {
            const https = require("https");
            const http = require("http");
            const client = url.startsWith("https") ? https : http;
            client
                .get(url, (resp) => {
                    if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                        return resolve(downloadImageToBuffer(resp.headers.location));
                    }
                    if (resp.statusCode !== 200) {
                        return reject(new Error("Failed to download image, status " + resp.statusCode));
                    }
                    const data = [];
                    resp.on("data", (chunk) => data.push(chunk));
                    resp.on("end", () => resolve(Buffer.concat(data)));
                })
                .on("error", reject);
        } catch (e) {
            reject(e);
        }
    });
}

async function searchByImage(req, res) {
    try {
        let buffer = null;
        if (req.file) buffer = await fs.readFile(req.file.path);
        else if (req.body && req.body.url) buffer = await downloadImageToBuffer(req.body.url);
        if (!buffer) return res.status(400).json({ error: "Vui lòng upload ảnh hoặc cung cấp url" });

        const method = (req.query?.method || "hash").toLowerCase();
        if (method === "clip") {
            try {
                const qVec = await clip.computeClipEmbedding(buffer);
                const topK = Number.isFinite(Number(req.query?.topK)) ? Number(req.query.topK) : 20;
                if (ann.isAvailable()) {
                    const annResults = await ann.annSearch(qVec, topK);
                    if (annResults && annResults.length) {
                        const minSim = Number.isFinite(Number(req.query?.minSim)) ? Number(req.query.minSim) : 0.25;
                        return res.json({
                            method: "clip",
                            model: clip.MODEL_ID,
                            results: annResults.filter((r) => r.similarity >= minSim).slice(0, topK),
                            info: {
                                totalIndexed: annResults.length,
                                minSim,
                                topK,
                                ann: true,
                            },
                        });
                    }
                }
                // fallback scan
                const [rows] = await db.execute(
                    `
          SELECT e.image_id, e.embedding, i.filename, i.original_name, i.title, i.description
          FROM image_embeddings e
          JOIN images i ON i.id = e.image_id
          WHERE e.model = ?
        `,
                    [clip.MODEL_ID]
                );
                const results = rows
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
                    .sort((a, b) => b.similarity - a.similarity);
                const minSim = Number.isFinite(Number(req.query?.minSim)) ? Number(req.query.minSim) : 0.25;
                return res.json({
                    method: "clip",
                    model: clip.MODEL_ID,
                    results: results.filter((r) => r.similarity >= minSim).slice(0, topK),
                    info: {
                        totalIndexed: rows.length,
                        minSim,
                        topK,
                        ann: false,
                    },
                });
            } catch (clipErr) {
                console.error("CLIP search error, fallback to hash:", clipErr);
            }
        }

        if (method === "color") {
            // Pure color-based search using global + center crops
            const qHists = [];
            try {
                const { vector, bins } = await colors.computeColorHistogram(buffer);
                qHists.push({ variant: "global", bins, vector });
                const centers = await computeCenterColorHistograms(buffer, [0.8, 0.6, 0.4]);
                for (const c of centers) qHists.push(c);
            } catch (e) {
                console.error("Query color hist error:", e);
                return res.status(500).json({ error: "Không thể trích xuất màu từ ảnh truy vấn" });
            }
            const [rows] = await db.execute(`
        SELECT ic.image_id, ic.variant, ic.histogram, i.filename, i.original_name, i.title, i.description
        FROM image_colors ic JOIN images i ON i.id = ic.image_id
      `);
            const byImage = new Map();
            for (const r of rows) {
                const hist = JSON.parse(r.histogram);
                let best = Infinity;
                for (const q of qHists) {
                    const d = colors.chiSquareDistance(q.vector, hist);
                    if (d < best) best = d;
                }
                const entry = byImage.get(r.image_id) || {
                    image_id: r.image_id,
                    filename: r.filename,
                    original_name: r.original_name,
                    title: r.title,
                    description: r.description,
                    bestColor: Infinity,
                };
                if (best < entry.bestColor) entry.bestColor = best;
                byImage.set(r.image_id, entry);
            }
            const topK = Number.isFinite(Number(req.query?.topK)) ? Number(req.query.topK) : 20;
            const results = Array.from(byImage.values())
                .map((it) => ({
                    imageId: it.image_id,
                    url: `/uploads/images/${it.filename}`,
                    filename: it.filename,
                    original_name: it.original_name,
                    title: it.title,
                    description: it.description,
                    colorDistance: Number(it.bestColor.toFixed(6)),
                    similarity: Number((1 - Math.min(1, it.bestColor / 2.0)).toFixed(6)),
                }))
                .sort((a, b) => a.colorDistance - b.colorDistance)
                .slice(0, topK);
            return res.json({ method: "color", results, info: { totalIndexed: byImage.size, topK } });
        }

        // Hash-based reverse search with query-tiles
        const queryHashes = [];
        const globalHash = await hash.computeDHashHex(buffer);
        queryHashes.push(globalHash);
        for (const g of [3, 4, 5]) {
            const t = await hash.computeTileDHashes(buffer, g);
            for (const h of t) queryHashes.push(h);
        }
        const overlapHashes = await hash.computeOverlappingTileDHashes(buffer, 4, 0.5);
        for (const h of overlapHashes) queryHashes.push(h);

        let qColor = null;
        try {
            const c = await colors.computeColorHistogram(buffer);
            qColor = c.vector;
        } catch (_) {}

        const [rows] = await db.execute(`
      SELECT ih.image_id, ih.tile_index, ih.hash, i.filename, i.original_name, i.title, i.description
      FROM image_hashes ih JOIN images i ON i.id = ih.image_id
    `);
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
                filename: r.filename,
                original_name: r.original_name,
                title: r.title,
                description: r.description,
                bestDistance: Infinity,
                bestTile: null,
            };
            if (bestForRow < entry.bestDistance) {
                entry.bestDistance = bestForRow;
                entry.bestTile = r.tile_index;
            }
            byImage.set(r.image_id, entry);
        }
        const results = Array.from(byImage.values())
            .map((it) => ({
                imageId: it.image_id,
                url: `/uploads/images/${it.filename}`,
                filename: it.filename,
                original_name: it.original_name,
                title: it.title,
                description: it.description,
                distance: it.bestDistance,
                similarity: Number((1 - it.bestDistance / 64).toFixed(4)),
                matchedTile: it.bestTile,
            }))
            .sort((a, b) => a.distance - b.distance);

        const threshold = Number.isFinite(Number(req.query?.threshold)) ? Number(req.query.threshold) : 20;
        const topK = Number.isFinite(Number(req.query?.topK)) ? Number(req.query.topK) : 20;
        let filtered = results.filter((r) => r.distance <= threshold).slice(0, topK);

        // Color-aware re-rank
        const hashWeight = Number.isFinite(Number(req.query?.hashWeight)) ? Number(req.query.hashWeight) : 0.7;
        const colorWeight = Number.isFinite(Number(req.query?.colorWeight)) ? Number(req.query.colorWeight) : 0.3;
        if (qColor && colorWeight > 0 && filtered.length > 0) {
            const ids = filtered.map((r) => r.imageId);
            const placeholders = ids.map(() => "?").join(",");
            const [colorRows] = await db.execute(`SELECT image_id, histogram FROM image_colors WHERE image_id IN (${placeholders})`, ids);
            const cmap = new Map(colorRows.map((cr) => [cr.image_id, JSON.parse(cr.histogram)]));
            filtered = filtered
                .map((r) => {
                    const ch = cmap.get(r.imageId);
                    let colorDist = 1;
                    if (Array.isArray(ch)) {
                        colorDist = colors.chiSquareDistance(qColor, ch);
                        colorDist = Math.min(1, colorDist / 2.0);
                    }
                    const hashDist = r.distance / 64;
                    const score = hashWeight * hashDist + colorWeight * colorDist;
                    return { ...r, score };
                })
                .sort((a, b) => a.score - b.score);
        }

        return res.json({
            method: "hash",
            query: { hash: globalHash },
            results: filtered,
            info: { totalIndexed: byImage.size, threshold, topK },
        });
    } catch (e) {
        console.error("Search-by-image error:", e);
        res.status(500).json({
            error: "Lỗi server khi tìm kiếm theo hình ảnh",
        });
    }
}

async function similarById(req, res) {
    try {
        const imageId = parseInt(req.params.id, 10);
        if (!Number.isInteger(imageId)) return res.status(400).json({ error: "ID không hợp lệ" });
        const [[imgRow]] = await db.execute("SELECT id, filename, file_path FROM images WHERE id = ? LIMIT 1", [imageId]);
        if (!imgRow) return res.status(404).json({ error: "Không tìm thấy ảnh" });
        const [hashRows] = await db.execute("SELECT hash FROM image_hashes WHERE image_id = ? AND tile_index = -1 LIMIT 1", [imageId]);
        let queryHash = hashRows[0]?.hash;
        if (!queryHash) {
            try {
                queryHash = await hash.computeDHashHex(imgRow.file_path);
                await db.execute("INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)", [imageId, -1, 0, queryHash, 0]);
            } catch (e) {
                console.error("Failed computing/storing global hash for", imageId, e);
                return res.status(500).json({ error: "Không thể tính hash cho ảnh" });
            }
        }
        const threshold = Number.isFinite(Number(req.query?.threshold)) ? Number(req.query.threshold) : 20;
        const topK = Number.isFinite(Number(req.query?.topK)) ? Number(req.query.topK) : 20;
        const [rows] = await db.execute(
            `
      SELECT ih.image_id, ih.tile_index, ih.hash, i.filename, i.original_name, i.title, i.description
      FROM image_hashes ih JOIN images i ON i.id = ih.image_id WHERE ih.image_id <> ?
    `,
            [imageId]
        );
        const byImage = new Map();
        for (const r of rows) {
            const d = hash.hammingDistanceHex(queryHash, r.hash);
            const entry = byImage.get(r.image_id) || {
                image_id: r.image_id,
                filename: r.filename,
                original_name: r.original_name,
                title: r.title,
                description: r.description,
                bestDistance: Infinity,
                bestTile: null,
            };
            if (d < entry.bestDistance) {
                entry.bestDistance = d;
                entry.bestTile = r.tile_index;
            }
            byImage.set(r.image_id, entry);
        }
        const results = Array.from(byImage.values())
            .map((it) => ({
                imageId: it.image_id,
                url: `/uploads/images/${it.filename}`,
                filename: it.filename,
                original_name: it.original_name,
                title: it.title,
                description: it.description,
                distance: it.bestDistance,
                similarity: Number((1 - it.bestDistance / 64).toFixed(4)),
                matchedTile: it.bestTile,
            }))
            .filter((r) => r.distance <= threshold)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, topK);
        res.json({
            query: { imageId, hash: queryHash },
            results,
            info: { threshold, topK },
        });
    } catch (e) {
        console.error("Similar-by-id error:", e);
        res.status(500).json({ error: "Lỗi server khi tìm ảnh tương tự" });
    }
}

module.exports = { searchText, searchByImage, similarById };
