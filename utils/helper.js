const fs = require("fs-extra");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
	destination: async (req, file, cb) => {
		const uploadPath = "uploads/images";
		await fs.ensureDir(uploadPath);
		cb(null, uploadPath);
	},
	filename: (req, file, cb) => {
		const uniqueName =
			Date.now() +
			"-" +
			Math.round(Math.random() * 1e9) +
			path.extname(file.originalname);
		cb(null, uniqueName);
	},
});

const upload = multer({
	storage: storage,
	limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
	fileFilter: (req, file, cb) => {
		const allowedTypes = [
			"image/jpeg",
			"image/jpg",
			"image/png",
			"image/gif",
			"image/webp",
		];
		if (allowedTypes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(new Error("Chỉ chấp nhận file hình ảnh"));
		}
	},
});

module.exports = { storage, upload };
