const db = require("../config/database");

async function insertImage(meta) {
    const sql = `INSERT INTO images (filename, original_name, file_path, file_size, mime_type, width, height, title, description, tags, content_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [meta.filename, meta.original_name, meta.file_path, meta.file_size, meta.mime_type, meta.width, meta.height, meta.title || "", meta.description || "", meta.tags || "", meta.content_hash || null];
    const [result] = await db.execute(sql, params);
    return result.insertId;
}

async function getImageById(id) {
    const [rows] = await db.execute("SELECT * FROM images WHERE id = ?", [id]);
    return rows[0] || null;
}

async function insertManyImages(metas) {
    if (!metas || metas.length === 0) {
        return null;
    }

    // For very large batches, split into smaller chunks
    const CHUNK_SIZE = 100; // Process in chunks of 100 to avoid SQL length limits
    
    if (metas.length <= CHUNK_SIZE) {
        return await insertManyImagesChunk(metas);
    }
    
    // Process in chunks
    let firstInsertId = null;
    let totalInserted = 0;
    
    for (let i = 0; i < metas.length; i += CHUNK_SIZE) {
        const chunk = metas.slice(i, i + CHUNK_SIZE);
        try {
            const chunkInsertId = await insertManyImagesChunk(chunk);
            if (chunkInsertId !== null) {
                if (firstInsertId === null) {
                    firstInsertId = chunkInsertId;
                }
                totalInserted += chunk.length;
            }
        } catch (error) {
            console.error(`Error inserting chunk ${Math.floor(i/CHUNK_SIZE) + 1}: ${error.message}`);
            // Continue with next chunk instead of failing completely
        }
    }
    
    return firstInsertId;
}

async function insertManyImagesChunk(metas) {
    if (!metas || metas.length === 0) {
        return null;
    }

    const fields = ['filename', 'original_name', 'file_path', 'file_size', 'mime_type', 'width', 'height', 'title', 'description', 'tags', 'content_hash'];
    
    // Use INSERT IGNORE to handle duplicates gracefully
    const placeholders = metas.map(() => `(${fields.map(() => '?').join(',')})`).join(',');
    const sql = `INSERT IGNORE INTO images (${fields.join(',')}) VALUES ${placeholders}`;

    const params = metas.flatMap(meta => [
        meta.filename,
        meta.original_name,
        meta.file_path,
        meta.file_size,
        meta.mime_type,
        meta.width,
        meta.height,
        meta.title || "",
        meta.description || "",
        meta.tags || "",
        meta.content_hash || null
    ]);

    try {
        const [result] = await db.execute(sql, params);
        return result.insertId; // Returns the ID of the first inserted row
    } catch (error) {
        // If we get a duplicate key error, try individual inserts to see which ones succeed
        if (error.code === 'ER_DUP_ENTRY') {
            console.log(`Handling duplicates in batch of ${metas.length} images...`);
            let successCount = 0;
            let firstId = null;
            
            for (const meta of metas) {
                try {
                    const id = await insertImage(meta);
                    if (id && firstId === null) firstId = id;
                    successCount++;
                } catch (dupError) {
                    // Ignore duplicate errors for individual inserts
                    if (dupError.code !== 'ER_DUP_ENTRY') {
                        console.warn(`Failed to insert image ${meta.filename}: ${dupError.message}`);
                    }
                }
            }
            
            console.log(`Successfully inserted ${successCount}/${metas.length} images from batch`);
            return firstId;
        }
        throw error;
    }
}

// Add function to check for existing images by content hash
async function getImageByContentHash(contentHash) {
    const [rows] = await db.execute("SELECT * FROM images WHERE content_hash = ?", [contentHash]);
    return rows[0] || null;
}

// Add function to get statistics
async function getImageStats() {
    const [countResult] = await db.execute("SELECT COUNT(*) as total FROM images");
    const [sizeResult] = await db.execute("SELECT SUM(file_size) as total_size FROM images");
    const [recentResult] = await db.execute("SELECT COUNT(*) as recent FROM images WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)");
    
    return {
        total: countResult[0].total,
        totalSize: sizeResult[0].total_size || 0,
        recentlyAdded: recentResult[0].recent
    };
}

module.exports = { 
    insertImage, 
    getImageById, 
    insertManyImages, 
    insertManyImagesChunk,
    getImageByContentHash,
    getImageStats 
};
