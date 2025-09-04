import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";
import "dotenv/config";
import database from "../config/database.js";
import { extractFeaturesFromFile } from "../services/features.js";

async function sha256File(filePath) {
    const h = crypto.createHash("sha256");
    const fh = await fs.open(filePath, "r");
    try {
        const stream = fh.createReadStream();
        for await (const chunk of stream) h.update(chunk);
        return h.digest("hex");
    } finally {
        await fh.close();
    }
}

async function* walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            yield* walk(full);
        } else {
            yield full;
        }
    }
}

async function ensureSchema() {
    // Optionally run schema here if desired; in this script we assume tables exist
}

async function insertImageAndFeatures(filePath, rootPublicDir) {
    const relPath = path.relative(rootPublicDir, filePath).replace(/\\/g, "/");
    const meta = await sharp(filePath).metadata();
    const checksum = await sha256File(filePath);
    const feats = await extractFeaturesFromFile(filePath);

    const mime = meta.format ? `image/${meta.format}` : "application/octet-stream";

    const conn = database;

    // Insert or get existing image id
    const [res] = await conn.execute(
        `INSERT INTO images (storage_path, mime_type, width, height, file_size, checksum_sha256, aspect_ratio_bucket, dominant_hue, exif_json)
         VALUES (:storage_path, :mime_type, :width, :height, :file_size, :checksum_sha256, :aspect_ratio_bucket, :dominant_hue, :exif_json)
         ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), updated_at=NOW()`,
        {
            storage_path: relPath,
            mime_type: mime,
            width: feats.width,
            height: feats.height,
            file_size: feats.file_size,
            checksum_sha256: checksum,
            aspect_ratio_bucket: feats.aspect_ratio_bucket,
            dominant_hue: feats.dominant_hue_bin,
            exif_json: meta ? JSON.stringify({ exif: meta.exif || null }) : null,
        }
    );

    const imageId = res.insertId;

    // Insert/Update features
    await conn.execute(
        `INSERT INTO image_features (
            image_id,
            hsv_hist, hsv_bins_h, hsv_bins_s, hsv_bins_v,
            thirds_grid_3x3,
            edge_orient_hist, edge_bins,
            dominant_colors, dominant_color_count
        ) VALUES (
            :image_id,
            :hsv_hist, :h_bins, :s_bins, :v_bins,
            :thirds_grid,
            :edge_hist, :edge_bins,
            :dom_colors, :dom_count
        )
        ON DUPLICATE KEY UPDATE
            hsv_hist=VALUES(hsv_hist),
            hsv_bins_h=VALUES(hsv_bins_h),
            hsv_bins_s=VALUES(hsv_bins_s),
            hsv_bins_v=VALUES(hsv_bins_v),
            thirds_grid_3x3=VALUES(thirds_grid_3x3),
            edge_orient_hist=VALUES(edge_orient_hist),
            edge_bins=VALUES(edge_bins),
            dominant_colors=VALUES(dominant_colors),
            dominant_color_count=VALUES(dominant_color_count)
        `,
        {
            image_id: imageId,
            hsv_hist: Buffer.from(feats.hsv_hist),
            h_bins: feats.hsv_bins_h,
            s_bins: feats.hsv_bins_s,
            v_bins: feats.hsv_bins_v,
            thirds_grid: Buffer.from(feats.thirds_grid_3x3),
            edge_hist: Buffer.from(feats.edge_orient_hist),
            edge_bins: feats.edge_bins,
            dom_colors: Buffer.from(feats.dominant_colors),
            dom_count: feats.dominant_color_count,
        }
    );

    return { id: imageId, path: relPath };
}

async function main() {
    const pubDir = path.join(process.cwd(), "public");
    const seedDir = path.join(pubDir, "uploads", "seed");
    console.log("Seeding from:", seedDir);

    let count = 0;
    for await (const file of walk(seedDir)) {
        const lower = file.toLowerCase();
        if (!/(\.jpg|\.jpeg|\.png|\.webp|\.bmp)$/i.test(lower)) continue;
        const { id, path: rel } = await insertImageAndFeatures(file, pubDir);
        count++;
        console.log(`Indexed #${id}: ${rel}`);
    }

    console.log(`Done. Indexed ${count} images.`);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

