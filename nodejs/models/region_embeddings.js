const db = require("../config/database");

async function ensureRegionTable() {
    const sql = `CREATE TABLE IF NOT EXISTS image_region_embeddings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    image_id BIGINT NOT NULL,
    model VARCHAR(255) NOT NULL,
    x INT NOT NULL,
    y INT NOT NULL,
    w INT NOT NULL,
    h INT NOT NULL,
    dim INT NOT NULL,
    embedding LONGTEXT NOT NULL,
    INDEX idx_image_model (image_id, model),
    INDEX idx_model (model)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
    await db.query(sql);
}

async function upsertRegionEmbedding(imageId, model, rect, vec) {
    const embedding = JSON.stringify(Array.from(vec));
    const dim = vec.length;
    const sql = `INSERT INTO image_region_embeddings (image_id, model, x, y, w, h, dim, embedding)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    await db.execute(sql, [imageId, model, rect.x, rect.y, rect.w, rect.h, dim, embedding]);
}

async function deleteRegionsForModel(model) {
    await db.execute("DELETE FROM image_region_embeddings WHERE model = ?", [model]);
}

async function getRegionsByModel(model) {
    const [rows] = await db.execute("SELECT image_id, x, y, w, h, dim, embedding FROM image_region_embeddings WHERE model = ?", [model]);
    return rows;
}

module.exports = {
    ensureRegionTable,
    upsertRegionEmbedding,
    deleteRegionsForModel,
    getRegionsByModel,
};

/**
 * Get images (with existing base embeddings) that are missing region embeddings for a model.
 * Ordered by image id with optional limit.
 * @param {string} model
 * @param {{ order?: 'ASC'|'DESC', limit?: number }} opts
 */
async function getImagesMissingRegions(model, opts = {}) {
    const order = (opts.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const limit = Math.max(0, parseInt(opts.limit || '0', 10));
    let sql = `SELECT i.id AS image_id, i.filename
               FROM images i
               JOIN image_embeddings e ON e.image_id = i.id AND e.model = ?
               LEFT JOIN image_region_embeddings r ON r.image_id = i.id AND r.model = ?
               WHERE r.id IS NULL
               ORDER BY i.id ${order}`;
    const params = [model, model];
    if (limit > 0) sql += ` LIMIT ${limit}`;
    const [rows] = await db.execute(sql, params);
    return rows;
}

module.exports.getImagesMissingRegions = getImagesMissingRegions;
