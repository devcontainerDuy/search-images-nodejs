-- (tùy chọn) CREATE DATABASE
-- CREATE DATABASE IF NOT EXISTS image_search_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
-- USE image_search_db;
-- 1) Ảnh gốc + metadata
CREATE TABLE
    IF NOT EXISTS images (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        storage_path VARCHAR(512) NOT NULL, -- đường dẫn file (disk/S3 URL)
        mime_type VARCHAR(100) NOT NULL,
        width INT UNSIGNED NOT NULL,
        height INT UNSIGNED NOT NULL,
        file_size BIGINT UNSIGNED NOT NULL, -- bytes
        checksum_sha256 CHAR(64) NOT NULL, -- chống trùng (unique)
        aspect_ratio_bucket TINYINT UNSIGNED NOT NULL, -- 1=portrait (<0.95), 2=square (~1), 3=landscape (>1.05) – bạn tùy định nghĩa
        dominant_hue TINYINT UNSIGNED NOT NULL, -- 0..35 (nếu H chia 36 bins); dùng để prefilter màu
        exif_json JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_images_checksum (checksum_sha256),
        KEY idx_images_ratio_hue (aspect_ratio_bucket, dominant_hue),
        KEY idx_images_created_at (created_at)
    ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- 2) Đặc trưng (feature vectors)
-- Lưu các mảng số ở dạng nhị phân (float32 little-endian) trong BLOB để tiết kiệm.
-- Nếu thích đọc dễ bằng SQL, bạn có thể chuyển sang JSON cho các mảng nhỏ (tradeoff kích thước).
CREATE TABLE
    IF NOT EXISTS image_features (
        image_id BIGINT UNSIGNED PRIMARY KEY, -- Histogram màu HSV: ví dụ H=36,S=8,V=8 => 2304 bins (float32) ~ 9KB/ảnh
        hsv_hist MEDIUMBLOB NOT NULL,
        hsv_bins_h SMALLINT UNSIGNED NOT NULL DEFAULT 36,
        hsv_bins_s SMALLINT UNSIGNED NOT NULL DEFAULT 8,
        hsv_bins_v SMALLINT UNSIGNED NOT NULL DEFAULT 8, -- Bố cục: brightness trung bình theo lưới 3x3 (9 float32 = 36 bytes)
        thirds_grid_3x3 VARBINARY(36) NOT NULL, -- Edge/orientation histogram (ví dụ 8 bins x float32 = 32 bytes)
        edge_orient_hist VARBINARY(32) NOT NULL,
        edge_bins SMALLINT UNSIGNED NOT NULL DEFAULT 8, -- Dominant colors (ví dụ 5 màu x 3 kênh HSV x float32 = 60 bytes)
        dominant_colors VARBINARY(60) NOT NULL,
        dominant_color_count TINYINT UNSIGNED NOT NULL DEFAULT 5, -- Embedding ngữ nghĩa (CLIP), float32 trong BLOB (thường 512 hoặc 768 chiều)
        clip_embed MEDIUMBLOB NULL,
        embed_dim SMALLINT UNSIGNED NULL,
        embed_norm FLOAT NULL, -- tùy chọn: lưu ||v|| để tăng tốc cosine
        -- Tags/objects để gợi ý ngữ cảnh (nếu có)
        objects_json JSON NULL,
        tags TEXT NULL,
        CONSTRAINT fk_features_image FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE ON UPDATE CASCADE,
        FULLTEXT KEY ft_tags (tags) -- yêu cầu InnoDB + MySQL 5.7+/8.x
    ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- 3) Nhật ký tìm kiếm (để tối ưu thuật toán, A/B, theo dõi latency)
CREATE TABLE
    IF NOT EXISTS search_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        query_checksum_sha256 CHAR(64) NOT NULL, -- hash của ảnh query sau chuẩn hóa
        filters JSON NULL, -- điều kiện prefilter (ratio, hue range…)
        stage_a_candidates INT UNSIGNED NOT NULL, -- số lượng ứng viên sau bước màu/bố cục
        stage_b_reranked INT UNSIGNED NOT NULL, -- số lượng rerank bằng CLIP
        latency_ms INT UNSIGNED NOT NULL, -- tổng thời gian xử lý (ms)
        top1_image_id BIGINT UNSIGNED NULL,
        topk_ids_json JSON NULL, -- lưu mảng id kết quả top-k
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_logs_query (query_checksum_sha256),
        KEY idx_logs_time (created_at),
        CONSTRAINT fk_logs_top1 FOREIGN KEY (top1_image_id) REFERENCES images (id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- (Optional) Bảng gom nhóm/bộ sưu tập nếu cần tổ chức kho ảnh
-- CREATE TABLE image_collections ( ... );