const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs-extra');
const db = require('../config/database');
const hash = require('../services/hashService');
const colors = require('../services/colorService');
const clip = require('../services/clipService');
const ann = require('../services/annService');

// Multer configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = 'uploads/images';
    try {
      await fs.ensureDir(uploadPath);
      cb(null, uploadPath);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/jpg','image/png','image/gif','image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file hình ảnh'));
  }
});

async function uploadImage(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file được upload' });
    const { title, description, tags } = req.body;
    const filePath = req.file.path;

    const metadata = await sharp(filePath).metadata();
    const [result] = await db.execute(
      `INSERT INTO images (filename, original_name, file_path, file_size, mime_type, width, height, title, description, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ req.file.filename, req.file.originalname, filePath, req.file.size, req.file.mimetype,
        metadata.width, metadata.height, title || '', description || '', tags || '' ]
    );

    // Hashes
    try {
      const globalHash = await hash.computeDHashHex(filePath);
      await db.execute('INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)',
        [result.insertId, -1, 0, globalHash, 0]);
      for (const g of [3,4,5]) {
        const tiles = await hash.computeTileDHashes(filePath, g);
        for (let i = 0; i < tiles.length; i++) {
          await db.execute('INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)',
            [result.insertId, i, g, tiles[i], 0]);
        }
      }
      const overlap = await hash.computeOverlappingTileDHashes(filePath, 4, 0.5);
      for (let i = 0; i < overlap.length; i++) {
        await db.execute('INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)',
          [result.insertId, i, 4, overlap[i], 50]);
      }
    } catch (e) { console.error('Hash computation error:', e); }

    // CLIP embedding
    try {
      const vec = await clip.computeClipEmbedding(filePath);
      await db.execute('INSERT INTO image_embeddings (image_id, model, dim, embedding) VALUES (?, ?, ?, ?)',
        [result.insertId, clip.MODEL_ID, vec.length, JSON.stringify(vec)]);
      ann.invalidate();
    } catch (e) { console.error('CLIP embedding error:', e); }

    // Colors
    try {
      const { vector, bins } = await colors.computeColorHistogram(filePath);
      await db.execute('INSERT INTO image_colors (image_id, bins, histogram) VALUES (?, ?, ?)',
        [result.insertId, bins, JSON.stringify(vector)]);
    } catch (e) { console.error('Color histogram error:', e); }

    return res.json({ success: true, imageId: result.insertId, message: 'Upload thành công' });
  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ error: 'Lỗi server khi upload' });
  }
}

async function getImage(req, res) {
  try {
    const [rows] = await db.execute('SELECT * FROM images WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy hình ảnh' });
    const image = rows[0];
    res.json({ ...image, url: `/uploads/images/${image.filename}` });
  } catch (e) {
    console.error('Get image error:', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function deleteImage(req, res) {
  try {
    const [rows] = await db.execute('SELECT * FROM images WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy hình ảnh' });
    const image = rows[0];
    try { await fs.remove(image.file_path); } catch (_) {}
    await db.execute('DELETE FROM images WHERE id = ?', [req.params.id]);
    await db.execute('DELETE FROM image_hashes WHERE image_id = ?', [req.params.id]);
    await db.execute('DELETE FROM image_embeddings WHERE image_id = ?', [req.params.id]);
    await db.execute('DELETE FROM image_colors WHERE image_id = ?', [req.params.id]);
    ann.invalidate();
    res.json({ success: true, message: 'Xóa thành công' });
  } catch (e) {
    console.error('Delete error:', e);
    res.status(500).json({ error: 'Lỗi server khi xóa' });
  }
}

async function reindexHashes(req, res) {
  try {
    const [images] = await db.execute('SELECT id, file_path FROM images');
    let reindexed = 0;
    for (const img of images) {
      try {
        await db.execute('DELETE FROM image_hashes WHERE image_id = ?', [img.id]);
        const globalHash = await hash.computeDHashHex(img.file_path);
        await db.execute('INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)',
          [img.id, -1, 0, globalHash, 0]);
        for (const g of [3,4,5]) {
          const tiles = await hash.computeTileDHashes(img.file_path, g);
          for (let i = 0; i < tiles.length; i++) {
            await db.execute('INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)',
              [img.id, i, g, tiles[i], 0]);
          }
        }
        const overlap = await hash.computeOverlappingTileDHashes(img.file_path, 4, 0.5);
        for (let i = 0; i < overlap.length; i++) {
          await db.execute('INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)',
            [img.id, i, 4, overlap[i], 50]);
        }
        reindexed++;
      } catch (e) { console.error('Reindex failed for image', img.id, e); }
    }
    res.json({ success: true, reindexed });
  } catch (e) {
    console.error('Reindex error:', e);
    res.status(500).json({ error: 'Lỗi server khi reindex' });
  }
}

async function reindexEmbeddings(req, res) {
  try {
    const [images] = await db.execute('SELECT id, file_path FROM images');
    let created = 0;
    for (const img of images) {
      const [exists] = await db.execute('SELECT COUNT(*) as c FROM image_embeddings WHERE image_id = ? AND model = ?', [img.id, clip.MODEL_ID]);
      if (exists[0].c > 0) continue;
      try {
        const vec = await clip.computeClipEmbedding(img.file_path);
        await db.execute('INSERT INTO image_embeddings (image_id, model, dim, embedding) VALUES (?, ?, ?, ?)',
          [img.id, clip.MODEL_ID, vec.length, JSON.stringify(vec)]);
        created++;
      } catch (e) { console.error('Reindex embedding failed for image', img.id, e); }
    }
    ann.invalidate();
    res.json({ success: true, created });
  } catch (e) {
    console.error('Reindex embeddings error:', e);
    res.status(500).json({ error: 'Lỗi server khi reindex embeddings' });
  }
}

async function reindexColors(req, res) {
  try {
    const [images] = await db.execute('SELECT id, file_path FROM images');
    let reindexed = 0;
    for (const img of images) {
      try {
        const { vector, bins } = await colors.computeColorHistogram(img.file_path);
        await db.execute('DELETE FROM image_colors WHERE image_id = ?', [img.id]);
        await db.execute('INSERT INTO image_colors (image_id, bins, histogram) VALUES (?, ?, ?)', [img.id, bins, JSON.stringify(vector)]);
        reindexed++;
      } catch (e) { console.error('Reindex color failed for image', img.id, e); }
    }
    res.json({ success: true, reindexed });
  } catch (e) {
    console.error('Reindex colors error:', e);
    res.status(500).json({ error: 'Lỗi server khi reindex colors' });
  }
}

module.exports = {
  upload,
  uploadImage,
  getImage,
  deleteImage,
  reindexHashes,
  reindexEmbeddings,
  reindexColors,
};

