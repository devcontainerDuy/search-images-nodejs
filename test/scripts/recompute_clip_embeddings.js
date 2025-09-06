// Recompute CLIP image embeddings for all images and upsert into DB
// Usage: node test/scripts/recompute_clip_embeddings.js

const db = require("../config/database");
const path = require("path");
const fs = require("fs-extra");
const clip = require("../services/clipService");

(async () => {
    try {
        const [rows] = await db.execute("SELECT id, file_path FROM images ORDER BY id");
        console.log(`Found ${rows.length} images. Recomputing embeddings with model ${clip.MODEL_ID}...`);

        let ok = 0,
            fail = 0;
        for (const r of rows) {
            try {
                const filePath = r.file_path;
                if (!filePath || !(await fs.pathExists(filePath))) {
                    console.warn(`Skip ${r.id}: file not found at ${filePath}`);
                    fail++;
                    continue;
                }
                const vec = await clip.computeClipEmbedding(filePath);
                const dim = vec.length;
                await db.execute("DELETE FROM image_embeddings WHERE image_id = ? AND model = ?", [r.id, clip.MODEL_ID]);
                await db.execute("INSERT INTO image_embeddings (image_id, model, dim, embedding) VALUES (?, ?, ?, ?)", [r.id, clip.MODEL_ID, dim, JSON.stringify(vec)]);
                ok++;
                if ((ok + fail) % 25 === 0) {
                    console.log(`Processed ${ok + fail}/${rows.length} (ok=${ok}, fail=${fail})`);
                }
            } catch (e) {
                console.error(`Fail image ${r.id}:`, e.message);
                fail++;
            }
        }
        console.log(`Done. ok=${ok}, fail=${fail}`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
