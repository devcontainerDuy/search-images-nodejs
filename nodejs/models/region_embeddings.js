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
