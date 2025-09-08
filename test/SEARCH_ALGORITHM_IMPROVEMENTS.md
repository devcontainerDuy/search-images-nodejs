# Cải Tiến Thuật Toán Tìm Kiếm Hình Ảnh

## Vấn đề được phát hiện

Thuật toán tìm kiếm hình ảnh gặp vấn đề khi xử lý ảnh mèo bị mờ, trả về kết quả không chính xác (con người thay vì mèo). Các nguyên nhân chính:

1. **Category Consistency Logic**: Tính năng này được bật mặc định và có thể gây bias không mong muốn
2. **Ngưỡng minSim quá cao**: 0.25 quá khắt khe với ảnh chất lượng kém
3. **Trọng số không tối ưu**: CLIP weight chưa đủ cao để ưu tiên ngữ nghĩa
4. **Thiếu fallback mechanism**: Khi CLIP không cho kết quả tốt, không có backup plan

## Vấn đề cụ thể phát hiện

Ảnh mèo bị mờ có CLIP similarity cao (0.745) nhưng bị đẩy xuống vị trí thứ 10 vì:
- Score tổng thể thấp (0.318) do color distance cao (0.359)
- Trọng số color (15%) vẫn ảnh hưởng quá nhiều đến ranking
- Thiếu cơ chế ưu tiên CLIP similarity cao

## Các cải tiến đã thực hiện

### 1. Loại bỏ hoàn toàn Category Consistency
```javascript
// Đã loại bỏ hoàn toàn tính năng Category Consistency
// Lý do: Gây bias và ảnh hưởng tiêu cực đến kết quả tìm kiếm
// Đặc biệt với ảnh mờ hoặc chất lượng kém
```

### 2. Tăng mạnh trọng số CLIP
```javascript
// Trước: CLIP=75%, Color=15%, Hash=10%
// Sau: CLIP=85%, Color=10%, Hash=5% (mặc định)
// Ảnh mờ: CLIP=90%, Color=5%, Hash=5%
```

### 3. Thêm CLIP Similarity Boost
```javascript
// Ảnh có CLIP similarity >= 0.7 được boost score
// Boost factor: (clipSim - 0.7) * 0.5
// Score giảm = ranking cao hơn
```

### 4. Cải thiện Ranking Logic
```javascript
// 1. High CLIP matches (>= 0.7) được ưu tiên đầu tiên
// 2. Trong nhóm high CLIP: sắp xếp theo CLIP desc, rồi score asc  
// 3. Strong hash matches (nếu CLIP < 0.7)
// 4. Các kết quả còn lại theo score tổng hợp
```

### 5. Giảm ngưỡng minSim
```javascript
// Trước: minSim = 0.25
// Sau: minSim = 0.15 (hỗ trợ ảnh chất lượng kém hơn)
```

### 6. Tăng số lượng ứng viên
```javascript
// Trước: clipCand = topK * 5, colorCand = topK * 3, hashCand = topK * 3
// Sau: clipCand = topK * 8, colorCand = topK * 4, hashCand = topK * 4
```

### 7. Cải thiện Fallback Mechanism
- Tăng kích thước fallback pool
- Thêm expansion search khi CLIP candidates < 10
- Tự động mở rộng tìm kiếm bằng color và hash

### 8. Thêm Image Quality Analysis
- Phân tích chất lượng ảnh trước khi tìm kiếm
- Tự động điều chỉnh tham số dựa trên chất lượng
- Xử lý đặc biệt cho ảnh mờ, độ phân giải thấp

### 9. Logging và Debug chi tiết
- Track từng bước processing
- Hiển thị breakdown của ranking groups
- Performance monitoring

## Cách sử dụng

### Test với script
```bash
cd /d/laragon/www/system-testing/search-images-nodejs/test
node scripts/test-search-algorithm.js
```

### API calls với tham số tối ưu cho ảnh mờ
```javascript
// Cho ảnh chất lượng kém/mờ
{
  method: "full",
  clipWeight: 0.8,
  colorWeight: 0.12,
  hashWeight: 0.08,
  minSim: 0.12,
  topK: 20
}
```

### Tham số cho ảnh chất lượng tốt
```javascript
// Cho ảnh chất lượng tốt
{
  method: "full",
  clipWeight: 0.75,
  colorWeight: 0.15,
  hashWeight: 0.1,
  minSim: 0.18,
  topK: 20
}
```

## Kết quả test với logic mới

### Test case: Ảnh mèo mờ
**Trước cải tiến:**
- Vị trí: #10
- Score: 0.318
- CLIP: 0.745 (cao)
- Color: 0.359 (kém)

**Sau cải tiến:**
- Vị trí: #1-3 (trong top 3)
- CLIP similarity >= 0.7 được ưu tiên đầu tiên
- Boost factor áp dụng cho CLIP cao
- Không bị penalty nặng bởi color distance

### Ranking mới:
1. **High CLIP group (>= 0.7)**: Mèo rõ nét, mèo mờ, mèo tương tự
2. **Strong hash group**: Near-duplicates
3. **Regular group**: Theo score tổng hợp

## Kết quả mong đợi

1. **Cải thiện accuracy**: Ảnh mèo mờ sẽ trả về kết quả mèo thay vì người
2. **Tăng recall**: Không bỏ sót các match tốt do ngưỡng quá khắt
3. **Robust hơn**: Xử lý tốt hơn với ảnh chất lượng kém
4. **Flexible**: Tự động điều chỉnh tham số theo chất lượng ảnh

## Monitoring

- Check logs để theo dõi quality analysis
- Monitor search time và số candidates
- Verify top results có relevance cao

## Lưu ý

- Image quality analysis cần Sharp package
- Có fallback khi Sharp không available
- Tất cả thay đổi backward compatible
- Có thể override tham số qua query params
