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

module.exports = { insertImage, getImageById };
