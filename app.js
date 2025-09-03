const createError = require("http-errors");
const express = require("express");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs-extra");
const {
	computeDHashHex,
	computeTileDHashes,
	computeOverlappingTileDHashes,
} = require("./utils/imageHash");
const db = require("./config/database");
const {
	computeClipEmbedding,
	cosineSimilarity,
	MODEL_ID,
} = require("./utils/clip");

const indexRouter = require("./routes/index");
const usersRouter = require("./routes/users");
// const apiRouter = require("./routes/api");

const app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(cors());
app.use(logger("dev"));
app.use(express.json());
// app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/", indexRouter);
app.use("/users", usersRouter);
// app.use("/api", apiRouter);

// catch 404 and forward to error handler
// (moved 404 + error handlers to the bottom)

// Ensure DB schema for image hashes exists
(async () => {
	try {
		await db.execute(`CREATE TABLE IF NOT EXISTS image_hashes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            image_id INT NOT NULL,
            tile_index INT NOT NULL, -- -1 for global image hash
            grid INT NOT NULL DEFAULT 4,
            hash CHAR(16) NOT NULL,
            stride INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX (image_id),
            INDEX (tile_index),
            INDEX (hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

		// Add stride column for older schemas if missing
		try {
			await db.execute(
				"ALTER TABLE image_hashes ADD COLUMN stride INT NOT NULL DEFAULT 0"
			);
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
	} catch (e) {
		console.error("Failed ensuring image_hashes schema:", e);
	}
})();

// Cấu hình multer để upload file
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

// Routes

// 1. Upload hình ảnh
app.post("/api/upload", upload.single("image"), async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: "Không có file được upload" });
		}

		const { title, description, tags } = req.body;
		const filePath = req.file.path;

		// Lấy thông tin hình ảnh
		const metadata = await sharp(filePath).metadata();

		// Lưu vào database ảnh
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
				`INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)`,
				[result.insertId, -1, 0, globalHash, 0]
			);

			// Tính nhiều lưới tile để hỗ trợ crop ~1/5 ảnh
			const grids = [3, 4, 5];
			for (const g of grids) {
				const tileHashes = await computeTileDHashes(filePath, g);
				if (Array.isArray(tileHashes)) {
					for (let i = 0; i < tileHashes.length; i++) {
						await db.execute(
							`INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)`,
							[result.insertId, i, g, tileHashes[i], 0]
						);
					}
				}
			}

			// Overlapping tiles for grid=4 with 50% overlap
			const overlapHashes = await computeOverlappingTileDHashes(
				filePath,
				4,
				0.5
			);
			for (let i = 0; i < overlapHashes.length; i++) {
				await db.execute(
					`INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)`,
					[result.insertId, i, 4, overlapHashes[i], 50]
				);
			}
		} catch (hashErr) {
			console.error("Hash computation error:", hashErr);
			// Không fail upload nếu hashing lỗi
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

// 2. Tìm kiếm hình ảnh
app.get("/api/search", async (req, res) => {
	try {
		const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
		const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
		const limitNum = Math.max(
			1,
			Math.min(100, parseInt(req.query.limit, 10) || 20)
		);
		const offsetNum = (pageNum - 1) * limitNum;

		let query = "SELECT * FROM images WHERE 1=1";
		let params = [];

		if (q) {
			query +=
				" AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR original_name LIKE ?)";
			const searchTerm = `%${q}%`;
			params.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}

		// Avoid placeholders for LIMIT/OFFSET due to MySQL prepared stmt quirks
		query += ` ORDER BY id DESC LIMIT ${
			offsetNum >= 0 ? offsetNum + 0 : 0
		}, ${limitNum}`;
		// Note: Using LIMIT offset, count syntax

		const [images] = await db.execute(query, params);

		// Count total without LIMIT/OFFSET
		let countQuery = "SELECT COUNT(*) as total FROM images WHERE 1=1";
		let countParams = [];
		if (q) {
			countQuery +=
				" AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR original_name LIKE ?)";
			const searchTerm = `%${q}%`;
			countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
		}
		const [countResult] = await db.execute(countQuery, countParams);
		const total =
			countResult[0] && countResult[0].total ? countResult[0].total : 0;

		res.json({
			images: images.map((img) => ({
				...img,
				url: `/uploads/images/${img.filename}`,
				thumbnail: `/uploads/images/${img.filename}`,
			})),
			pagination: {
				current: pageNum,
				limit: limitNum,
				total: total,
				pages: Math.ceil(total / limitNum),
			},
		});
	} catch (error) {
		console.error("Search error:", error);
		res.status(500).json({ error: "Lỗi server khi tìm kiếm" });
	}
});

// 3. Lấy chi tiết hình ảnh
app.get("/api/image/:id", async (req, res) => {
	try {
		const [images] = await db.execute("SELECT * FROM images WHERE id = ?", [
			req.params.id,
		]);

		if (images.length === 0) {
			return res.status(404).json({ error: "Không tìm thấy hình ảnh" });
		}

		const image = images[0];
		res.json({
			...image,
			url: `/uploads/images/${image.filename}`,
		});
	} catch (error) {
		console.error("Get image error:", error);
		res.status(500).json({ error: "Lỗi server" });
	}
});

// 4. Xóa hình ảnh
app.delete("/api/image/:id", async (req, res) => {
	try {
		const [images] = await db.execute("SELECT * FROM images WHERE id = ?", [
			req.params.id,
		]);

		if (images.length === 0) {
			return res.status(404).json({ error: "Không tìm thấy hình ảnh" });
		}

		const image = images[0];

		// Xóa file
		try {
			await fs.remove(image.file_path);
		} catch (e) {
			// ignore file removal errors
		}

		// Xóa record trong database
		await db.execute("DELETE FROM images WHERE id = ?", [req.params.id]);
		await db.execute("DELETE FROM image_hashes WHERE image_id = ?", [
			req.params.id,
		]);
		await db.execute("DELETE FROM image_embeddings WHERE image_id = ?", [
			req.params.id,
		]);

		res.json({ success: true, message: "Xóa thành công" });
	} catch (error) {
		console.error("Delete error:", error);
		res.status(500).json({ error: "Lỗi server khi xóa" });
	}
});

// 4b. Reindex hashes for existing images (idempotent)
app.post("/api/reindex-hashes", async (req, res) => {
	try {
		const [images] = await db.execute("SELECT id, file_path FROM images");
		let reindexed = 0;
		for (const img of images) {
			try {
				// Xóa hash cũ để index lại đầy đủ
				await db.execute(
					"DELETE FROM image_hashes WHERE image_id = ?",
					[img.id]
				);

				const globalHash = await computeDHashHex(img.file_path);
				await db.execute(
					"INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)",
					[img.id, -1, 0, globalHash, 0]
				);

				const grids = [3, 4, 5];
				for (const g of grids) {
					const tileHashes = await computeTileDHashes(
						img.file_path,
						g
					);
					for (let i = 0; i < tileHashes.length; i++) {
						await db.execute(
							"INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)",
							[img.id, i, g, tileHashes[i], 0]
						);
					}
				}
				// overlapping for grid=4
				const overlapHashes = await computeOverlappingTileDHashes(
					img.file_path,
					4,
					0.5
				);
				for (let i = 0; i < overlapHashes.length; i++) {
					await db.execute(
						"INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)",
						[img.id, i, 4, overlapHashes[i], 50]
					);
				}
				reindexed++;
			} catch (e) {
				console.error("Reindex failed for image", img.id, e);
			}
		}
		res.json({ success: true, reindexed });
	} catch (e) {
		console.error("Reindex error:", e);
		res.status(500).json({ error: "Lỗi server khi reindex" });
	}
});

// 4c. Reindex CLIP embeddings for existing images (idempotent)
app.post("/api/reindex-embeddings", async (req, res) => {
	try {
		const [images] = await db.execute("SELECT id, file_path FROM images");
		let created = 0;
		for (const img of images) {
			const [exists] = await db.execute(
				"SELECT COUNT(*) as c FROM image_embeddings WHERE image_id = ? AND model = ?",
				[img.id, MODEL_ID]
			);
			if (exists[0].c > 0) continue;
			try {
				const vec = await computeClipEmbedding(img.file_path);
				await db.execute(
					"INSERT INTO image_embeddings (image_id, model, dim, embedding) VALUES (?, ?, ?, ?)",
					[img.id, MODEL_ID, vec.length, JSON.stringify(vec)]
				);
				created++;
			} catch (e) {
				console.error("Reindex embedding failed for image", img.id, e);
			}
		}
		res.json({ success: true, created });
	} catch (e) {
		console.error("Reindex embeddings error:", e);
		res.status(500).json({ error: "Lỗi server khi reindex embeddings" });
	}
});

// 5. Tìm kiếm bằng hình ảnh (reverse image search)
app.post("/api/search-by-image", upload.single("image"), async (req, res) => {
	try {
		let buffer = null;
		if (req.file) {
			buffer = await fs.readFile(req.file.path);
		} else if (req.body && req.body.url) {
			// Tải ảnh từ URL
			buffer = await downloadImageToBuffer(req.body.url);
		}

		if (!buffer) {
			return res
				.status(400)
				.json({ error: "Vui lòng upload ảnh hoặc cung cấp url" });
		}

		const method = (
			req.query && req.query.method ? req.query.method : "hash"
		).toLowerCase();
		if (method === "clip") {
			try {
				const qVec = await computeClipEmbedding(buffer);
				const [rows] = await db.execute(
					`
                SELECT e.image_id, e.embedding, i.filename, i.original_name, i.title, i.description
                FROM image_embeddings e
                JOIN images i ON i.id = e.image_id
                WHERE e.model = ?
            `,
					[MODEL_ID]
				);

			const results = rows
				.map((r) => {
					const emb = JSON.parse(r.embedding);
					const sim = cosineSimilarity(qVec, emb);
					return {
						imageId: r.image_id,
						url: `/uploads/images/${r.filename}`,
						filename: r.filename,
						original_name: r.original_name,
						title: r.title,
						description: r.description,
						similarity: Number(sim.toFixed(6)),
					};
				})
				.sort((a, b) => b.similarity - a.similarity);

			const minSim = Number.isFinite(
				Number(
					req.query && req.query.minSim ? req.query.minSim : undefined
				)
			)
				? Number(req.query.minSim)
				: 0.25;
			const topK = Number.isFinite(
				Number(req.query && req.query.topK ? req.query.topK : undefined)
			)
				? Number(req.query.topK)
				: 20;
			const filtered = results
				.filter((r) => r.similarity >= minSim)
				.slice(0, topK);

			return res.json({
				method: "clip",
				model: MODEL_ID,
				results: filtered,
				info: { totalIndexed: rows.length, minSim, topK },
			});
			} catch (clipErr) {
				console.error("CLIP search error, fallback to hash:", clipErr);
				// fall through to hash search below
			}
		}

			// Hash-based reverse search (default)
			const queryHash = await computeDHashHex(buffer);
			const [rows] = await db.execute(`
                SELECT ih.image_id, ih.tile_index, ih.hash, i.filename, i.original_name, i.title, i.description
                FROM image_hashes ih
                JOIN images i ON i.id = ih.image_id
            `);

			const byImage = new Map();
			for (const r of rows) {
				const dist = hammingDistanceHex(queryHash, r.hash);
				const entry = byImage.get(r.image_id) || {
					image_id: r.image_id,
					filename: r.filename,
					original_name: r.original_name,
					title: r.title,
					description: r.description,
					bestDistance: Infinity,
					bestTile: null,
				};
				if (dist < entry.bestDistance) {
					entry.bestDistance = dist;
					entry.bestTile = r.tile_index;
				}
				byImage.set(r.image_id, entry);
			}

			const results = Array.from(byImage.values())
				.map((it) => ({
					imageId: it.image_id,
					url: `/uploads/images/${it.filename}`,
					filename: it.filename,
					original_name: it.original_name,
					title: it.title,
					description: it.description,
					distance: it.bestDistance,
					similarity: Number((1 - it.bestDistance / 64).toFixed(4)),
					matchedTile: it.bestTile,
				}))
				.sort((a, b) => a.distance - b.distance);

			const threshold = Number.isFinite(
				Number(
					req.query && req.query.threshold
						? req.query.threshold
						: undefined
				)
			)
				? Number(req.query.threshold)
				: 20;
			const topK = Number.isFinite(
				Number(req.query && req.query.topK ? req.query.topK : undefined)
			)
				? Number(req.query.topK)
				: 20;
			const filtered = results
				.filter((r) => r.distance <= threshold)
				.slice(0, topK);

			return res.json({
				method: "hash",
				query: { hash: queryHash },
				results: filtered,
				info: { totalIndexed: byImage.size, threshold, topK },
			});
	} catch (error) {
		console.error("Search-by-image error:", error);
		res.status(500).json({
			error: "Lỗi server khi tìm kiếm theo hình ảnh",
		});
	}
});

function hammingDistanceHex(hex1, hex2) {
	const b1 = Buffer.from(hex1, "hex");
	const b2 = Buffer.from(hex2, "hex");
	const len = Math.min(b1.length, b2.length);
	let dist = 0;
	for (let i = 0; i < len; i++) {
		let x = b1[i] ^ b2[i];
		// count bits
		while (x) {
			dist += x & 1;
			x >>= 1;
		}
	}
	// if lengths differ, count remaining set bits of the longer buffer
	if (b1.length !== b2.length) {
		const longer = b1.length > b2.length ? b1 : b2;
		for (let i = len; i < longer.length; i++) {
			let x = longer[i];
			while (x) {
				dist += x & 1;
				x >>= 1;
			}
		}
	}
	return dist;
}

async function downloadImageToBuffer(url) {
	return new Promise((resolve, reject) => {
		try {
			const https = require("https");
			const http = require("http");
			const client = url.startsWith("https") ? https : http;
			client
				.get(url, (resp) => {
					if (
						resp.statusCode &&
						resp.statusCode >= 300 &&
						resp.statusCode < 400 &&
						resp.headers.location
					) {
						// redirect
						return resolve(
							downloadImageToBuffer(resp.headers.location)
						);
					}
					if (resp.statusCode !== 200) {
						return reject(
							new Error(
								"Failed to download image, status " +
									resp.statusCode
							)
						);
					}
					const data = [];
					resp.on("data", (chunk) => data.push(chunk));
					resp.on("end", () => resolve(Buffer.concat(data)));
				})
				.on("error", reject);
		} catch (e) {
			reject(e);
		}
	});
}

// 5b. Tìm ảnh tương tự bằng ID ảnh đã có
app.get("/api/image/:id/similar", async (req, res) => {
	try {
		const imageId = parseInt(req.params.id, 10);
		if (!Number.isInteger(imageId)) {
			return res.status(400).json({ error: "ID không hợp lệ" });
		}

		// Lấy hash toàn ảnh nếu có; nếu chưa có thì tính từ file
		const [[imgRow]] = await db.execute(
			"SELECT id, filename, file_path FROM images WHERE id = ? LIMIT 1",
			[imageId]
		);
		if (!imgRow)
			return res.status(404).json({ error: "Không tìm thấy ảnh" });

		const [hashRows] = await db.execute(
			"SELECT hash FROM image_hashes WHERE image_id = ? AND tile_index = -1 LIMIT 1",
			[imageId]
		);
		let queryHash =
			hashRows[0] && hashRows[0].hash ? hashRows[0].hash : undefined;
		if (!queryHash) {
			try {
				queryHash = await computeDHashHex(imgRow.file_path);
				await db.execute(
					"INSERT INTO image_hashes (image_id, tile_index, grid, hash, stride) VALUES (?, ?, ?, ?, ?)",
					[imageId, -1, 0, queryHash, 0]
				);
			} catch (e) {
				console.error(
					"Failed computing/storing global hash for",
					imageId,
					e
				);
				return res
					.status(500)
					.json({ error: "Không thể tính hash cho ảnh" });
			}
		}

		const threshold = Number.isFinite(
			Number(
				req.query && req.query.threshold
					? req.query.threshold
					: undefined
			)
		)
			? Number(req.query.threshold)
			: 20;
		const topK = Number.isFinite(
			Number(req.query && req.query.topK ? req.query.topK : undefined)
		)
			? Number(req.query.topK)
			: 20;

		// Lấy tất cả hash đã index và so khớp, loại trừ chính ảnh đó
		const [rows] = await db.execute(
			`
            SELECT ih.image_id, ih.tile_index, ih.hash, i.filename, i.original_name, i.title, i.description
            FROM image_hashes ih
            JOIN images i ON i.id = ih.image_id
            WHERE ih.image_id <> ?
        `,
			[imageId]
		);

		const byImage = new Map();
		for (const r of rows) {
			const dist = hammingDistanceHex(queryHash, r.hash);
			const entry = byImage.get(r.image_id) || {
				image_id: r.image_id,
				filename: r.filename,
				original_name: r.original_name,
				title: r.title,
				description: r.description,
				bestDistance: Infinity,
				bestTile: null,
			};
			if (dist < entry.bestDistance) {
				entry.bestDistance = dist;
				entry.bestTile = r.tile_index;
			}
			byImage.set(r.image_id, entry);
		}

		const results = Array.from(byImage.values())
			.map((it) => ({
				imageId: it.image_id,
				url: `/uploads/images/${it.filename}`,
				filename: it.filename,
				original_name: it.original_name,
				title: it.title,
				description: it.description,
				distance: it.bestDistance,
				similarity: Number((1 - it.bestDistance / 64).toFixed(4)),
				matchedTile: it.bestTile,
			}))
			.filter((r) => r.distance <= threshold)
			.sort((a, b) => a.distance - b.distance)
			.slice(0, topK);

		res.json({
			query: { imageId, hash: queryHash },
			results,
			info: { threshold, topK },
		});
	} catch (e) {
		console.error("Similar-by-id error:", e);
		res.status(500).json({ error: "Lỗi server khi tìm ảnh tương tự" });
	}
});

// Serve frontend via EJS instead of static HTML (for unknown GET paths)
app.get("*", (req, res, next) => {
	// Only handle GET that haven't matched earlier routes
	res.render("index", { title: "Image Search" });
});

// catch 404 for other methods and forward to error handler
app.use(function (req, res, next) {
	next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
	res.locals.message = err.message;
	res.locals.error = req.app.get("env") === "development" ? err : {};
	res.status(err.status || 500);
	res.render("error");
});

module.exports = app;
