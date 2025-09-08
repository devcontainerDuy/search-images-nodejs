from flask import Flask, request, jsonify
import torch
import clip
from PIL import Image
import io
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import os
import logging
import json
from flask_cors import CORS
import cv2
from torchvision import transforms
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

app = Flask(__name__)
CORS(app)  # Cho phép Cross-Origin requests
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Cấu hình
device = "cuda" if torch.cuda.is_available() else "cpu"
logging.info(f"Sử dụng thiết bị: {device}")

# Thử tải model lớn hơn nếu có GPU, nếu không thì dùng model nhỏ
if device == "cuda":
    try:
        model, preprocess = clip.load("ViT-L/14", device=device)
        model_name = "ViT-L/14"
        logging.info("Đã tải mô hình CLIP ViT-L/14")
    except:
        model, preprocess = clip.load("ViT-B/32", device=device)
        model_name = "ViT-B/32"
        logging.info("Đã tải mô hình CLIP ViT-B/32")
else:
    model, preprocess = clip.load("ViT-B/32", device=device)
    model_name = "ViT-B/32"
    logging.info("Đã tải mô hình CLIP ViT-B/32")

# Thư mục chứa ảnh sản phẩm
product_image_folder = "../uploads/products/"
# File cache cho đặc trưng ảnh
feature_file_path = f"image_features_{model_name.replace('/', '_')}.npy"
paths_file_path = "image_paths.txt"
metadata_file_path = "product_metadata.json"
augmentation_enabled = True  # Có thể bật/tắt tăng cường dữ liệu

# Biến toàn cục
image_paths = []
image_features = None
product_metadata = {}
executor = ThreadPoolExecutor(max_workers=4)  # Cho xử lý song song

# Các hàm tăng cường dữ liệu
def apply_augmentations(img_pil):
    """Tạo nhiều phiên bản tăng cường của ảnh đầu vào"""
    augmented_images = [img_pil]  # Bao gồm ảnh gốc

    # Chuyển đổi sang OpenCV để xử lý
    img_cv = np.array(img_pil)
    img_cv = cv2.cvtColor(img_cv, cv2.COLOR_RGB2BGR)

    # 1. Cải thiện độ tương phản
    lab = cv2.cvtColor(img_cv, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    enhanced_lab = cv2.merge((cl, a, b))
    enhanced_img = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
    enhanced_pil = Image.fromarray(cv2.cvtColor(enhanced_img, cv2.COLOR_BGR2RGB))
    augmented_images.append(enhanced_pil)

    # 2. Cân bằng histogram toàn cầu
    img_yuv = cv2.cvtColor(img_cv, cv2.COLOR_BGR2YUV)
    img_yuv[:,:,0] = cv2.equalizeHist(img_yuv[:,:,0])
    hist_eq = cv2.cvtColor(img_yuv, cv2.COLOR_YUV2BGR)
    hist_eq_pil = Image.fromarray(cv2.cvtColor(hist_eq, cv2.COLOR_BGR2RGB))
    augmented_images.append(hist_eq_pil)

    # 3. Lọc Gaussian nhẹ để làm giảm nhiễu
    blurred = cv2.GaussianBlur(img_cv, (3, 3), 0)
    blurred_pil = Image.fromarray(cv2.cvtColor(blurred, cv2.COLOR_BGR2RGB))
    augmented_images.append(blurred_pil)

    # 4. Điều chỉnh độ sáng - tối hơn một chút
    brightness = cv2.convertScaleAbs(img_cv, alpha=0.9, beta=0)
    dark_pil = Image.fromarray(cv2.cvtColor(brightness, cv2.COLOR_BGR2RGB))
    augmented_images.append(dark_pil)

    # 5. Điều chỉnh độ sáng - sáng hơn một chút
    brightness = cv2.convertScaleAbs(img_cv, alpha=1.1, beta=10)
    bright_pil = Image.fromarray(cv2.cvtColor(brightness, cv2.COLOR_BGR2RGB))
    augmented_images.append(bright_pil)

    return augmented_images

# Trích xuất đặc trưng từ một ảnh với tăng cường dữ liệu
def extract_features_with_augmentation(img_pil):
    """Trích xuất đặc trưng từ ảnh với tăng cường dữ liệu và tính trung bình"""
    if not augmentation_enabled:
        # Nếu không bật tăng cường, chỉ xử lý ảnh thường
        return extract_features_single(img_pil)

    # Tạo các phiên bản ảnh tăng cường
    augmented_images = apply_augmentations(img_pil)

    # Trích xuất đặc trưng cho mỗi phiên bản
    all_features = []
    for aug_img in augmented_images:
        # Xử lý ảnh với CLIP
        image_tensor = preprocess(aug_img).unsqueeze(0).to(device)
        with torch.no_grad():
            feature = model.encode_image(image_tensor)
            feature = feature.cpu().numpy()
            feature /= np.linalg.norm(feature)
            all_features.append(feature)

    # Tính trung bình các vector đặc trưng
    mean_feature = np.mean(all_features, axis=0)
    mean_feature /= np.linalg.norm(mean_feature)  # Chuẩn hóa lại

    return mean_feature

# Trích xuất đặc trưng từ một ảnh duy nhất
def extract_features_single(img_pil):
    """Trích xuất đặc trưng từ một ảnh đơn"""
    image_tensor = preprocess(img_pil).unsqueeze(0).to(device)
    with torch.no_grad():
        feature = model.encode_image(image_tensor)
        feature = feature.cpu().numpy()
        feature /= np.linalg.norm(feature)
    return feature

# Tải dữ liệu đặc trưng từ file cache
def load_image_features():
    global image_paths, image_features, product_metadata

    if os.path.exists(feature_file_path) and os.path.exists(paths_file_path):
        logging.info(f"🔄 Đang load feature từ file cache: {feature_file_path}...")
        image_features = np.load(feature_file_path)
        with open(paths_file_path, 'r', encoding='utf-8') as f:
            image_paths = [line.strip() for line in f.readlines()]

        # Tải metadata sản phẩm nếu có
        if os.path.exists(metadata_file_path):
            with open(metadata_file_path, 'r', encoding='utf-8') as f:
                product_metadata = json.load(f)

        logging.info(f"✅ Đã load {len(image_paths)} ảnh và đặc trưng.")
    else:
        logging.info("⚙️ Không tìm thấy dữ liệu sẵn có. Đang build lại...")
        build_image_database()

# Xử lý ảnh theo batch để tiết kiệm bộ nhớ và tăng tốc
def process_image_batch(batch_files):
    results = []
    for filename in batch_files:
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            path = os.path.join(product_image_folder, filename)
            try:
                # Đọc ảnh
                original_image = Image.open(path).convert("RGB")

                # Trích xuất đặc trưng với tăng cường dữ liệu
                feature = extract_features_with_augmentation(original_image)

                # Lưu metadata cơ bản
                metadata = {
                    "filename": filename,
                    "path": path,
                    "size": [original_image.width, original_image.height],
                    "format": original_image.format,
                    "created": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(os.path.getctime(path)))
                }

                results.append((filename, feature, metadata))
            except Exception as e:
                logging.warning(f"❌ Bỏ qua {filename}: {e}")
    return results

# Xây dựng cơ sở dữ liệu đặc trưng hình ảnh
def build_image_database():
    global image_paths, image_features, product_metadata

    logging.info(f"Đang xử lý ảnh từ thư mục: {product_image_folder}")

    # Lấy danh sách tất cả các file ảnh
    all_files = [f for f in os.listdir(product_image_folder)
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]

    if not all_files:
        logging.error("❌ Không tìm thấy ảnh hợp lệ trong thư mục!")
        return

    # Chia thành các batch để xử lý
    batch_size = 50  # Điều chỉnh theo RAM có sẵn
    batches = [all_files[i:i + batch_size] for i in range(0, len(all_files), batch_size)]

    paths = []
    features = []
    metadata = {}

    processed_count = 0
    start_time = time.time()

    # Xử lý từng batch
    for i, batch in enumerate(batches):
        logging.info(f"Đang xử lý batch {i+1}/{len(batches)}...")

        # Xử lý song song
        batch_results = list(executor.map(process_image_batch, [[f] for f in batch]))
        batch_results = [item for sublist in batch_results for item in sublist]  # Flatten

        for filename, feature, meta in batch_results:
            paths.append(filename)
            features.append(feature)
            metadata[filename] = meta

            processed_count += 1
            if processed_count % 10 == 0:
                elapsed = time.time() - start_time
                img_per_sec = processed_count / elapsed
                logging.info(f"Đã xử lý {processed_count}/{len(all_files)} ảnh... ({img_per_sec:.2f} ảnh/giây)")

    if features:
        image_paths = paths
        image_features = np.vstack(features)
        product_metadata = metadata

        # Lưu vào file để tái sử dụng
        np.save(feature_file_path, image_features)
        with open(paths_file_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(image_paths))
        with open(metadata_file_path, 'w', encoding='utf-8') as f:
            json.dump(product_metadata, f, ensure_ascii=False, indent=2)

        logging.info(f"✅ Build database hoàn tất. Đã xử lý {len(paths)} ảnh trong {time.time() - start_time:.2f} giây.")
    else:
        logging.error("❌ Không xử lý được ảnh nào!")

# Cache đặc trưng để tránh tính toán lặp lại
@lru_cache(maxsize=100)
def get_feature_from_bytes_cached(image_bytes_hash):
    try:
        # Tạo đối tượng BytesIO từ hash
        image_bytes = image_bytes_dict.get(image_bytes_hash)
        if image_bytes is None:
            return None

        # Đọc ảnh từ bytes
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # Trích xuất đặc trưng với tăng cường dữ liệu
        feature = extract_features_with_augmentation(image)

        return feature
    except Exception as e:
        logging.error(f"Lỗi khi xử lý ảnh gửi lên: {e}")
        return None

# Dictionary để lưu trữ tạm thời bytes của ảnh
image_bytes_dict = {}

# Trích xuất đặc trưng từ ảnh được tải lên
def get_feature_from_bytes(image_bytes):
    # Tạo hash từ bytes của ảnh
    image_bytes_hash = hash(image_bytes)

    # Lưu trữ bytes vào dictionary
    image_bytes_dict[image_bytes_hash] = image_bytes

    # Gọi hàm cache
    return get_feature_from_bytes_cached(image_bytes_hash)

@app.route('/search', methods=['POST'])
def search():
    start_time = time.time()

    if 'image' not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file = request.files['image']
    img_bytes = file.read()

    # Lấy các tham số tìm kiếm
    min_similarity = float(request.form.get('min_similarity', 0.65))
    top_k = int(request.form.get('top_k', 50))
    category = request.form.get('category', None)

    # Tùy chọn tăng cường
    use_augmentation = request.form.get('use_augmentation', 'true').lower() == 'true'
    global augmentation_enabled
    augmentation_enabled = use_augmentation

    # Thêm log để theo dõi
    logging.info(f"Nhận yêu cầu tìm kiếm: min_sim={min_similarity}, top_k={top_k}, augmentation={augmentation_enabled}")

    # Trích xuất đặc trưng từ ảnh tìm kiếm
    query_feature = get_feature_from_bytes(img_bytes)
    feature_time = time.time() - start_time
    logging.info(f"Thời gian trích xuất đặc trưng: {feature_time:.4f}s")

    if query_feature is None or image_features is None:
        return jsonify({"error": "Không thể xử lý ảnh"}), 500

    # Tính toán điểm tương đồng
    similarity_start = time.time()
    sims = cosine_similarity(query_feature, image_features)[0]
    similarity_time = time.time() - similarity_start
    logging.info(f"Thời gian tính cosine similarity: {similarity_time:.4f}s")

    # Sắp xếp kết quả theo điểm số từ cao đến thấp
    sorting_start = time.time()
    sorted_indices = sims.argsort()[::-1]
    sorting_time = time.time() - sorting_start

    results = []
    for idx in sorted_indices:
        # Chỉ lấy kết quả có điểm số trên ngưỡng
        if sims[idx] < min_similarity:
            continue

        image_name = image_paths[idx]

        # Bỏ qua nếu có lọc danh mục và không khớp
        if category and product_metadata.get(image_name, {}).get('category', '') != category:
            continue

        # Thêm kết quả
        results.append({
            "image": image_name,
            "score": float(sims[idx]),
            "image_url": f"/uploads/products/{image_name}",
            "metadata": product_metadata.get(image_name, {})
        })

        # Dừng khi đủ số lượng kết quả yêu cầu
        if len(results) >= top_k:
            break

    total_time = time.time() - start_time
    logging.info(f"Tìm kiếm hoàn tất: {len(results)} kết quả trong {total_time:.4f}s")

    return jsonify({
        "total_results": len(results),
        "min_similarity": min_similarity,
        "results": results,
        "timing": {
            "feature_extraction": feature_time,
            "similarity_calculation": similarity_time,
            "sorting": sorting_time,
            "total": total_time
        },
        "use_augmentation": augmentation_enabled,
        "model": model_name
    })

@app.route('/rebuild', methods=['GET'])
def rebuild_database():
    build_image_database()
    return jsonify({"status": "success", "message": "Đã xây dựng lại cơ sở dữ liệu hình ảnh"})

@app.route('/stats', methods=['GET'])
def get_stats():
    return jsonify({
        "total_images": len(image_paths),
        "device": device,
        "model": model_name,
        "image_folder": product_image_folder,
        "augmentation_enabled": augmentation_enabled
    })

@app.route('/toggle_augmentation', methods=['POST'])
def toggle_augmentation():
    global augmentation_enabled
    data = request.get_json()
    if 'enabled' in data:
        augmentation_enabled = data['enabled']
        logging.info(f"Đã {('bật' if augmentation_enabled else 'tắt')} tính năng tăng cường dữ liệu")
        return jsonify({"status": "success", "augmentation_enabled": augmentation_enabled})

    return jsonify({"error": "Invalid request"}), 400

if __name__ == '__main__':
    load_image_features()
    app.run(host='0.0.0.0', port=5000, debug=True)
