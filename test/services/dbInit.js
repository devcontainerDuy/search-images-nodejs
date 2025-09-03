const db = require("../config/database");

async function ensureSchemas() {
    try {
        await db.execute(`CREATE TABLE IF NOT EXISTS images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_size BIGINT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      width INT NOT NULL,
      height INT NOT NULL,
      title VARCHAR(255) DEFAULT '',
      description TEXT,
      tags VARCHAR(255) DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await db.execute(`CREATE TABLE IF NOT EXISTS image_hashes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      image_id INT NOT NULL,
      tile_index INT NOT NULL,
      grid INT NOT NULL DEFAULT 4,
      hash CHAR(16) NOT NULL,
      stride INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (image_id),
      INDEX (tile_index),
      INDEX (hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        try {
            await db.execute("ALTER TABLE image_hashes ADD COLUMN stride INT NOT NULL DEFAULT 0");
        } catch (e) {}

        await db.execute(`CREATE TABLE IF NOT EXISTS image_embeddings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      image_id INT NOT NULL,
      model VARCHAR(100) NOT NULL,
      dim INT NOT NULL,
      embedding MEDIUMTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (image_id),
      INDEX (model)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await db.execute(`CREATE TABLE IF NOT EXISTS image_colors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      image_id INT NOT NULL,
      bins INT NOT NULL,
      histogram MEDIUMTEXT NOT NULL,
      variant VARCHAR(20) NOT NULL DEFAULT 'global',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (image_id),
      INDEX (image_id, variant)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    try { await db.execute("ALTER TABLE image_colors ADD COLUMN variant VARCHAR(20) NOT NULL DEFAULT 'global'"); } catch (e) {}
    try { await db.execute("CREATE INDEX idx_image_colors_image_variant ON image_colors (image_id, variant)"); } catch (e) {}
    } catch (e) {
        console.error("Failed ensuring DB schemas:", e);
    }
}

module.exports = { ensureSchemas };
