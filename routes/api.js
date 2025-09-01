const express = require('express');
const router = express.Router();

// 1. Upload hình ảnh
router.post("/api/upload", upload.single("image"), async (req, res) => {
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