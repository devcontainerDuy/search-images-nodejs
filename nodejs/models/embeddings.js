const db = require("../config/database");

async function upsertEmbedding(imageId, model, vec) {
    const dim = vec.length;
    const embedding = JSON.stringify(Array.from(vec));
    const sql = `INSERT INTO image_embeddings (image_id, model, dim, embedding)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE dim = VALUES(dim), embedding = VALUES(embedding)`;
    await db.execute(sql, [imageId, model, dim, embedding]);
}

async function getEmbeddingsWithImages(model) {
    const sql = `SELECT e.image_id, e.dim, e.embedding, i.filename, i.title, i.description, i.tags, i.width, i.height
                FROM image_embeddings e
                JOIN images i ON i.id = e.image_id
                WHERE e.model = ?`;
    const [rows] = await db.execute(sql, [model]);
    return rows;
}

async function getMissingImageIdsForModel(model) {
    const sql = `SELECT i.id as id, i.file_path as file_path, i.filename as filename
                FROM images i
                WHERE NOT EXISTS (
                  SELECT 1 FROM image_embeddings e WHERE e.image_id = i.id AND e.model = ?
                )`;
    const [rows] = await db.execute(sql, [model]);
    return rows;
}

module.exports = { upsertEmbedding, getEmbeddingsWithImages, getMissingImageIdsForModel };
