/**
 * ensure.js
 *
 * Idempotent migration script to optimize the image search schema.
 * - Adds helpful indexes (BTREE & FULLTEXT)
 * - Adds UNIQUE constraints to prevent duplicates
 * - Adds foreign keys with ON DELETE CASCADE
 * - Optional binary hash column for compact indexing (disabled by default, enable flag)
 *
 * Usage:
 *   node ensure.js
 *
 * Requires a local './database' module exporting a `execute(sql, params?)` function
 * compatible with mysql2/promise.
 */

const db = require("./database");

// === CONFIG ===
const ENABLE_HASH_BIN = false; // set true if you want to add BINARY(8) hash_bin and migrate data

async function getSingleVal(sql, params = []) {
    const [rows] = await db.execute(sql, params);
    const row = rows && rows[0];
    const key = row && Object.keys(row)[0];
    return key ? row[key] : null;
}

async function indexExists(table, indexName) {
    const sql = `
    SELECT COUNT(*) AS cnt
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND index_name = ?
  `;
    const cnt = await getSingleVal(sql, [table, indexName]);
    return Number(cnt) > 0;
}

async function fkExists(constraintName) {
    const sql = `
    SELECT COUNT(*) AS cnt
    FROM information_schema.referential_constraints
    WHERE constraint_schema = DATABASE()
      AND constraint_name = ?
  `;
    const cnt = await getSingleVal(sql, [constraintName]);
    return Number(cnt) > 0;
}

async function columnExists(table, column) {
    const sql = `
    SELECT COUNT(*) AS cnt
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND column_name = ?
  `;
    const cnt = await getSingleVal(sql, [table, column]);
    return Number(cnt) > 0;
}

async function constraintExists(table, constraintName) {
    const sql = `
    SELECT COUNT(*) AS cnt
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND constraint_name = ?
  `;
    const cnt = await getSingleVal(sql, [table, constraintName]);
    return Number(cnt) > 0;
}

async function addIndex(table, indexName, createSql) {
    if (!(await indexExists(table, indexName))) {
        console.log(`+ Creating index ${indexName} on ${table}`);
        await db.execute(createSql);
    } else {
        console.log(`✓ Index ${indexName} already exists on ${table}`);
    }
}

async function addUnique(table, constraintName, createSql) {
    if (!(await constraintExists(table, constraintName))) {
        console.log(`+ Creating UNIQUE ${constraintName} on ${table}`);
        await db.execute(createSql);
    } else {
        console.log(`✓ UNIQUE ${constraintName} already exists on ${table}`);
    }
}

async function addForeignKey(table, constraintName, createSql) {
    if (!(await fkExists(constraintName))) {
        console.log(`+ Adding FK ${constraintName} on ${table}`);
        await db.execute(createSql);
    } else {
        console.log(`✓ FK ${constraintName} already exists on ${table}`);
    }
}

async function addColumnIfMissing(table, colDefSql, columnName) {
    if (!(await columnExists(table, columnName))) {
        console.log(`+ Adding column ${table}.${columnName}`);
        await db.execute(`ALTER TABLE ${table} ADD ${colDefSql}`);
    } else {
        console.log(`✓ Column ${table}.${columnName} exists`);
    }
}

async function migrate() {
    try {
        // Ensure base tables exist (light guard; assumes your ensureSchemas() already ran)
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

        // === images ===
        await addIndex("images", "idx_images_created_at", "ALTER TABLE images ADD INDEX idx_images_created_at (created_at)");

        // Either unique file_path or unique filename. Choose based on your business rule.
        // Here we prioritize unique file_path:
        await addUnique("images", "uq_images_file_path", "ALTER TABLE images ADD UNIQUE uq_images_file_path (file_path)");

        // FULLTEXT index for text search on title/description/tags
        // Note: MySQL supports FULLTEXT on InnoDB from 5.6+ (better in 5.7/8.0)
        await addIndex("images", "ft_images_text", "ALTER TABLE images ADD FULLTEXT ft_images_text (title, description, tags)");

        // Optional content hash (for dedup by content)
        if (!(await columnExists("images", "content_hash"))) {
            await addColumnIfMissing("images", "content_hash CHAR(32) NULL", "content_hash");
            await addIndex("images", "images_content_hash", "ALTER TABLE images ADD INDEX images_content_hash (content_hash)");
        }

        // === image_hashes ===
        await addIndex("image_hashes", "idx_hashes_hash_grid_stride", "ALTER TABLE image_hashes ADD INDEX idx_hashes_hash_grid_stride (hash, grid, stride)");
        await addIndex("image_hashes", "idx_hashes_image_tile", "ALTER TABLE image_hashes ADD INDEX idx_hashes_image_tile (image_id, tile_index)");

        if (ENABLE_HASH_BIN) {
            // add binary hash column for compact index and migrate data from hex (CHAR16) => BINARY(8)
            await addColumnIfMissing("image_hashes", "hash_bin BINARY(8)", "hash_bin");
            // backfill if needed
            console.log("~ Backfilling hash_bin from hex hash...");
            await db.execute(`UPDATE image_hashes SET hash_bin = UNHEX(hash) WHERE hash_bin IS NULL OR hash_bin = 0x''`);
            await addIndex("image_hashes", "idx_hashes_hashbin_grid_stride", "ALTER TABLE image_hashes ADD INDEX idx_hashes_hashbin_grid_stride (hash_bin, grid, stride)");
        }

        // === image_embeddings ===
        await addUnique("image_embeddings", "uq_embeddings_image_model", "ALTER TABLE image_embeddings ADD UNIQUE uq_embeddings_image_model (image_id, model)");
        await addIndex("image_embeddings", "idx_embeddings_model_dim", "ALTER TABLE image_embeddings ADD INDEX idx_embeddings_model_dim (model, dim)");

        // === image_colors ===
        await addUnique("image_colors", "uq_colors_image_variant_bins", "ALTER TABLE image_colors ADD UNIQUE uq_colors_image_variant_bins (image_id, variant, bins)");
        await addIndex("image_colors", "idx_colors_image_variant_bins", "ALTER TABLE image_colors ADD INDEX idx_colors_image_variant_bins (image_id, variant, bins)");

        // === Foreign Keys (after cleaning orphan rows) ===
        await addForeignKey("image_hashes", "fk_image_hashes_image", "ALTER TABLE image_hashes ADD CONSTRAINT fk_image_hashes_image FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE");
        await addForeignKey("image_embeddings", "fk_image_embeddings_image", "ALTER TABLE image_embeddings ADD CONSTRAINT fk_image_embeddings_image FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE");
        await addForeignKey("image_colors", "fk_image_colors_image", "ALTER TABLE image_colors ADD CONSTRAINT fk_image_colors_image FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE");

        console.log("\nAll migrations completed successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
