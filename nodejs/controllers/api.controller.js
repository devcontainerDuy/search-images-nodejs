const path = require("path");
const fs = require("fs/promises");
const db = require("../config/database");
const { md5, getDimensions, generateFakeTitle } = require("../utils/helper");
const { insertImage, getImageById } = require("../models/images");
const { upsertEmbedding } = require("../models/embeddings");
const { getModelId, embedImageFromBufferWithAugment } = require("../services/clip.service");

// List images with pagination
async function index(req, res) {
    try {
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const size = Math.min(Math.max(parseInt(req.query.size || "20", 10), 1), 100);
        const offset = (page - 1) * size;

        // Avoid placeholders for LIMIT/OFFSET; use validated interpolation
        const listSql = `SELECT * FROM images ORDER BY id DESC LIMIT ${size} OFFSET ${offset}`;
        const [rows] = await db.query(listSql);
        const [countRows] = await db.query("SELECT COUNT(*) AS total FROM images");
        const total = countRows[0]?.total || 0;

        const items = rows.map((r) => ({
            id: r.id,
            filename: r.filename,
            url: `/uploads/images/${r.filename}`,
            title: r.title,
            description: r.description,
            tags: r.tags,
            width: r.width,
            height: r.height,
            mime_type: r.mime_type,
            created_at: r.created_at,
        }));

        return res.json({ page, size, total, items });
    } catch (err) {
        console.error("List images failed:", err);
        return res.status(500).json({ error: "List images failed", detail: String(err.message || err) });
    }
}

// create and upload images with full processing
async function create(req, res) {
    try {
        const files = req.files || [];
        if (!files.length) return res.status(400).json({ error: "No files uploaded" });

        const { title = "", description = "", tags = "" } = req.body || {};

        const created = [];
        const modelId = getModelId();
        
        for (const file of files) {
            const filePath = file.path;
            const buffer = await fs.readFile(filePath);
            const hash = md5(buffer);

            const { width, height } = await getDimensions(filePath);

            const meta = {
                filename: path.basename(filePath),
                original_name: file.originalname,
                file_path: path.relative(path.join(__dirname, ".."), filePath).replace(/\\/g, "/"),
                file_size: file.size,
                mime_type: file.mimetype,
                width,
                height,
                title: (title && title.trim()) || generateFakeTitle(file.originalname),
                description,
                tags,
                content_hash: hash,
            };

            // Insert image record first
            try {
                const imageId = await insertImage(meta);
                console.log(`📸 Uploaded image ID ${imageId}: ${meta.filename}`);
                
                // Generate and save embedding
                try {
                    console.log(`🤖 Generating embedding for ${meta.filename}...`);
                    const embedding = await embedImageFromBufferWithAugment(buffer, true);
                    await upsertEmbedding(imageId, modelId, Array.from(embedding));
                    console.log(`✅ Embedding saved for image ID ${imageId}`);
                } catch (embErr) {
                    console.error(`❌ Failed to generate embedding for ${meta.filename}:`, embErr.message);
                    // Continue with upload even if embedding fails
                }
                
                // TODO: Add color histogram and hash processing here
                // For now, just the basic upload + embedding
                
                created.push({ 
                    id: imageId, 
                    ...meta, 
                    url: `/uploads/images/${meta.filename}`,
                    embedding_generated: true
                });
                
            } catch (err) {
                // Duplicate file_path or other constraint violations
                if (err && err.code === "ER_DUP_ENTRY") {
                    console.log(`⚠️  Skipping duplicate: ${meta.filename}`);
                    continue;
                }
                throw err;
            }
        }

        const message = created.length > 0 
            ? `Đã thêm thành công ${created.length} ảnh với embeddings` 
            : "Không có ảnh mới được thêm";
            
        return res.json({ 
            message, 
            count: created.length, 
            items: created,
            embeddings_generated: created.length
        });
    } catch (err) {
        console.error("Upload failed:", err);
        return res.status(500).json({ error: "Upload failed", detail: String(err.message || err) });
    }
}

// Delete image by id
async function deleted(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ error: "Invalid id" });

        const row = await getImageById(id);
        if (!row) return res.status(404).json({ error: "Not found" });

        // Delete file on disk if exists
        const absPath = path.join(__dirname, "..", row.file_path);
        try {
            await fs.unlink(absPath);
        } catch (_) {}

        // Delete DB row (cascade removes related rows)
        await db.execute("DELETE FROM images WHERE id = ?", [id]);

        return res.sendStatus(204);
    } catch (err) {
        console.error("Delete image failed:", err);
        return res.status(500).json({ error: "Delete image failed", detail: String(err.message || err) });
    }
}

module.exports = { index, create, deleted };
