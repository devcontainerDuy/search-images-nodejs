const express = require("express");
const { computeDHashHex } = require("../../utils/imageHash");
const router = express.Router();
const db = require("../../config/database");
const { computeClipEmbedding, MODEL_ID } = require("../../utils/clip");
const { upload } = require("../../utils/helper");
const sharp = require("sharp");

// 1. Upload hình ảnh
router.post("/upload", upload.single("image"), async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: "Không có file được upload" });
		}

		const { title, description, tags } = req.body;
		const filePath = req.file.path;

		// Lấy thông tin hình ảnh
		const metadata = await sharp(filePath).metadata();

		// Lưu vào database
		const [result] = await db.execute(
			`INSERT INTO images (filename, original_name, file_path, file_size, mime_type, width, height, title, description, tags)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				req.file.filename,
				req.file.originalname,
				filePath,
				req.file.size,
				req.file.mimetype,
				metadata.width,
				metadata.height,
				title || "",
				description || "",
				tags || "",
			]
		);

		// Tính và lưu perceptual hashes (dHash) cho tìm kiếm theo hình ảnh
		try {
			const globalHash = await computeDHashHex(filePath);
			// Lưu hash toàn ảnh (tile_index = -1) với grid=0 để phân biệt
			await db.execute(
				`INSERT INTO image_hashes (image_id, tile_index, grid_size, hash) VALUES (?, ?, ?, ?)`,
				[result.insertId, -1, 0, globalHash]
			);

			// Tính nhiều lưới tile để hỗ trợ crop ~1/5 ảnh
			const grids = [3, 4, 5];
			for (const g of grids) {
				const tileHashes = await computeDHashHex(filePath, g);
				// Lưu hash từng tile với tile_index = g
				if (Array.isArray(tileHashes)) {
					for (let i = 0; i < tileHashes.length; i++) {
						await db.execute(
							`INSERT INTO image_hashes (image_id, tile_index, grid_size, hash) VALUES (?, ?, ?, ?)`,
							[result.insertId, i, g, tileHashes[i], 0]
						);
					}
				}
			}

			// Overlapping tiles for grid=4 with 50% overlaps
			const overlapHashes = await computeDHashHex(filePath, 4, 0.5);
			for (let i = 0; i < overlapHashes.length; i++) {
				await db.execute(
					`INSERT INTO image_hashes (image_id, tile_index, grid_size, hash) VALUES (?, ?, ?, ?)`,
					[result.insertId, i, 4, overlapHashes[i], 0]
				);
			}
		} catch (hashError) {
			console.error("Hashing error:", hashError);
			// Không fail upload nếu hashing thất bại
		}

		// Tính và lưu embedding CLIP để tìm kiếm ngữ nghĩa
		try {
			const vec = await computeClipEmbedding(filePath);
			await db.execute(
				`INSERT INTO image_embeddings (image_id, model, dim, embedding) VALUES (?, ?, ?, ?)`,
				[result.insertId, MODEL_ID, vec.length, JSON.stringify(vec)]
			);
		} catch (embErr) {
			console.error("CLIP embedding error:", embErr);
		}

		res.json({
			success: true,
			imageId: result.insertId,
			message: "Upload thành công",
		});
	} catch (error) {
		console.error("Upload error:", error);
		res.status(500).json({ error: "Lỗi server khi upload" });
	}
});

module.exports = router;
