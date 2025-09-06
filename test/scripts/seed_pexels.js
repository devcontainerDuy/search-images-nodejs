#!/usr/bin/env node
// Seed database with images from Pexels
// Usage examples:
//   node scripts/seed_pexels.js --query=people --max=200            // auto-paginate up to 200 images
//   node scripts/seed_pexels.js --query="cats" --page=1 --per_page=80 --max_pages=5

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const https = require("https");
const http = require("http");
const url = require("url");
const path = require("path");
const fs = require("fs-extra");
const db = require("../config/database");
const sharp = require("@xenova/transformers/node_modules/sharp");
const hash = require("../services/hashService");
const colors = require("../services/colorService");
const { computeCenterColorHistograms } = require("../utils/color");
const clip = require("../services/clipService");
const ann = require("../services/annService");

const API_KEY = process.env.JWT_SECRET_PEXELS;
if (!API_KEY) {
    console.error("Missing JWT_SECRET_PEXELS in environment.");
    process.exit(1);
}

function parseArgs() {
    const args = Object.fromEntries(
        process.argv.slice(2).map((a) => {
            const [k, v = "true"] = a.replace(/^--/, "").split("=");
            return [k, v];
        })
    );
    return {
        query: args.query || "people",
        page: Number(args.page || 1),
        per_page: Number(args.per_page || args.count || 80),
        max: args.max ? Number(args.max) : null,
        max_pages: args.max_pages ? Number(args.max_pages) : null,
    };
}

function httpGetBuffer(href, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(href);
        const client = u.protocol === "https:" ? https : http;
        const req = client.get(href, { headers }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(httpGetBuffer(res.headers.location, headers));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Request failed ${res.statusCode} ${res.statusMessage}`));
            }
            const chunks = [];
            res.on("data", (d) => chunks.push(d));
            res.on("end", () => resolve(Buffer.concat(chunks)));
        });
        req.on("error", reject);
    });
}

async function fetchPexelsPage({ query, page, per_page }) {
    const endpoint = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${per_page}`;
    const buf = await httpGetBuffer(endpoint, { Authorization: API_KEY });
    const json = JSON.parse(buf.toString("utf8"));
    const photos = Array.isArray(json.photos) ? json.photos : [];
    return { photos, next_page: json.next_page || null, page: json.page || page, per_page: json.per_page || per_page, total_results: json.total_results || null };
}

function pickImageUrl(photo) {
    const s = photo?.src || {};
    return s.original || s.large2x || s.large || s.medium || s.small || s.tiny || null;
}

async function insertOne(photo) {
    const imgUrl = pickImageUrl(photo);
    if (!imgUrl) throw new Error("No usable image URL");

    const uploadDir = path.join(__dirname, "..", "uploads", "images");
    await fs.ensureDir(uploadDir);

    const ext = path.extname(new URL(imgUrl).pathname) || ".jpg";
    const filename = `${Date.now()}-${Math.floor(Math.random() * 1e9)}${ext}`;
    const filePath = path.join(uploadDir, filename);

    const data = await httpGetBuffer(imgUrl);
    await fs.writeFile(filePath, data);

    const meta = await sharp(filePath).metadata();
    const stat = await fs.stat(filePath);

    const title = photo?.alt || "";
    const description = `Pexels ID ${photo?.id || ""} by ${photo?.photographer || ""}`.trim();
    const tags = [photo?.photographer_url, photo?.url].filter(Boolean).join(",");

    const [insertRes] = await db.execute(
        `INSERT INTO images (filename, original_name, file_path, file_size, mime_type, width, height, title, description, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            filename,
            path.basename(new URL(imgUrl).pathname),
            filePath,
            stat.size,
            meta.format ? `image/${meta.format}` : "image/jpeg",
            meta.width || 0,
            meta.height || 0,
            title,
            description,
            tags,
        ]
    );
    const imageId = insertRes.insertId;

    // Hashes
    try {
        const globalHash = await hash.computeDHashHex(filePath);
        await db.execute("INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)", [imageId, -1, 0, globalHash, 0]);
        for (const g of [3, 4, 5]) {
            const tiles = await hash.computeTileDHashes(filePath, g);
            for (let i = 0; i < tiles.length; i++) {
                await db.execute("INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)", [imageId, i, g, tiles[i], 0]);
            }
        }
        const overlap = await hash.computeOverlappingTileDHashes(filePath, 4, 0.5);
        for (let i = 0; i < overlap.length; i++) {
            await db.execute("INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)", [imageId, i, 4, overlap[i], 50]);
        }
    } catch (e) {
        console.error("hash error", e.message);
    }

    // Colors
    try {
        const { vector, bins } = await colors.computeColorHistogram(filePath);
        await db.execute("INSERT INTO image_colors (image_id, bins, histogram, variant) VALUES (?, ?, ?, ?)", [imageId, bins, JSON.stringify(vector), "global"]);
        const centers = await computeCenterColorHistograms(filePath, [0.8, 0.6, 0.4]);
        for (const c of centers) {
            await db.execute("INSERT INTO image_colors (image_id, bins, histogram, variant) VALUES (?, ?, ?, ?)", [imageId, c.bins, JSON.stringify(c.vector), c.variant]);
        }
    } catch (e) {
        console.error("color error", e.message);
    }

    // CLIP embedding (image tower)
    try {
        const vec = await clip.computeClipEmbedding(filePath);
        await db.execute("INSERT INTO image_embeddings (image_id, model, dim, embedding) VALUES (?, ?, ?, ?)", [imageId, clip.MODEL_ID, vec.length, JSON.stringify(vec)]);
        ann.invalidate();
    } catch (e) {
        console.error("clip error", e.message);
    }

    return { imageId, filename, filePath };
}

(async () => {
    try {
        const opts = parseArgs();
        console.log(`Seeding from Pexels: query='${opts.query}', start page=${opts.page}, per_page=${opts.per_page}, max=${opts.max ?? "∞"}, max_pages=${opts.max_pages ?? "∞"}`);

        let page = opts.page;
        let pageCount = 0;
        let totalOk = 0,
            totalFail = 0;

        while (true) {
            if (opts.max_pages && pageCount >= opts.max_pages) break;
            const { photos, next_page, total_results } = await fetchPexelsPage({ query: opts.query, page, per_page: opts.per_page });
            console.log(`Page ${page} — ${photos.length} photos${total_results != null ? ` (total_results=${total_results})` : ""}`);
            if (!photos.length) break;

            for (const p of photos) {
                if (opts.max && totalOk >= opts.max) break;
                try {
                    await insertOne(p);
                    totalOk++;
                } catch (e) {
                    console.error("insert fail", e.message);
                    totalFail++;
                }
                if ((totalOk + totalFail) % 10 === 0) console.log(`Inserted ${totalOk} (fail=${totalFail})`);
            }
            if (opts.max && totalOk >= opts.max) break;

            pageCount++;
            if (!next_page) break;
            try {
                const u = new URL(next_page);
                const next = Number(u.searchParams.get("page") || page + 1);
                page = Number.isFinite(next) ? next : page + 1;
            } catch {
                page += 1;
            }

            // small delay to be polite
            await new Promise((r) => setTimeout(r, 300));
        }

        console.log(`Done. Inserted ok=${totalOk}, fail=${totalFail}`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
