# Fetch Pexels Script - Upgrade for 100k+ Records

## Cải tiến chính

### 1. Concurrency Control (Kiểm soát đồng thời)
- **Semaphore Pattern**: Giới hạn số lượng downloads và API calls đồng thời
- **Configurable Limits**: Có thể điều chỉnh `MAX_CONCURRENT_DOWNLOADS` và `MAX_CONCURRENT_PAGES`
- **Rate Limiting**: Thêm delay giữa các request để tránh bị chặn

### 2. Batch Processing (Xử lý theo lô)
- **Chunked Processing**: Chia nhỏ dữ liệu thành các chunk để tránh quá tải memory
- **Database Batch Insert**: Sử dụng `INSERT IGNORE` để xử lý duplicate một cách graceful
- **Error Recovery**: Tiếp tục xử lý ngay cả khi một batch bị lỗi

### 3. Robust Error Handling (Xử lý lỗi mạnh mẽ)
- **Retry Logic**: Tự động retry khi gặp lỗi network hoặc rate limit
- **Exponential Backoff**: Tăng thời gian delay sau mỗi lần retry
- **Graceful Degradation**: Không dừng toàn bộ process khi một phần bị lỗi

### 4. Progress Tracking (Theo dõi tiến độ)
- **Real-time Progress**: Hiển thị tiến độ và ETA
- **Performance Metrics**: Tracking tốc độ xử lý và lỗi
- **Checkpoint System**: Ghi log định kỳ để theo dõi

### 5. Multiple Processing Modes (Nhiều chế độ xử lý)

#### Single Page Mode (Chế độ trang đơn - backward compatible)
```bash
node scripts/fetch-pexels.js "cats" 80 1
```

#### Range Mode (Chế độ phạm vi - cho xử lý số lượng lớn)
```bash
node scripts/fetch-pexels.js range "cats" 1 100 80
# Xử lý từ trang 1 đến 100, 80 ảnh mỗi trang = tối đa 8000 ảnh
```

#### Bulk Mode (Chế độ hàng loạt - cho multiple queries)
```bash
node scripts/fetch-pexels.js bulk sample-queries.txt 80 50
# Xử lý tất cả queries trong file, mỗi query tối đa 50 trang
```

### 6. Database Optimizations (Tối ưu database)
- **Connection Pool**: Tăng connection limit từ 10 lên 20
- **Chunked Inserts**: Chia batch insert thành chunks nhỏ hơn
- **Duplicate Handling**: Sử dụng `INSERT IGNORE` và fallback strategies

### 7. Memory Management (Quản lý bộ nhớ)
- **Stream Processing**: Không giữ tất cả dữ liệu trong memory cùng lúc
- **Buffer Optimization**: Giải phóng buffer ngay sau khi save file
- **Garbage Collection**: Thiết kế để minimize memory footprint

## Sử dụng cho 100k+ records

### Cách 1: Bulk Processing với nhiều queries
```bash
# Tạo file queries với nhiều từ khóa
node scripts/fetch-pexels.js bulk sample-queries.txt 80 100
# 100 queries × 100 pages × 80 images = 800,000 images tối đa
```

### Cách 2: Range Processing với query lớn
```bash
# Xử lý một query với nhiều trang
node scripts/fetch-pexels.js range "nature" 1 1000 80
# 1000 pages × 80 images = 80,000 images
```

### Cách 3: Multiple Sessions
```bash
# Chạy nhiều session song song với range khác nhau
node scripts/fetch-pexels.js range "cats" 1 500 80 &
node scripts/fetch-pexels.js range "dogs" 1 500 80 &
node scripts/fetch-pexels.js range "nature" 1 500 80 &
```

## Monitoring (Theo dõi)

```bash
# Xem tiến độ hiện tại
node scripts/monitor-progress.js

# Theo dõi liên tục (mỗi 30 giây)
node scripts/monitor-progress.js 30
```

## Configuration (Cấu hình)

Điều chỉnh trong file `fetch-pexels.js`:

```javascript
const CONFIG = {
    MAX_CONCURRENT_DOWNLOADS: 10,  // Tăng nếu network tốt
    MAX_CONCURRENT_PAGES: 3,       // Tăng nếu API limit cao
    BATCH_SIZE: 50,                // Giảm nếu gặp memory issues
    MAX_RETRIES: 3,                // Số lần retry
    RETRY_DELAY: 1000,             // Delay giữa các retry (ms)
    RATE_LIMIT_DELAY: 100,         // Delay giữa API calls (ms)
    MAX_PAGES_PER_QUERY: 1000,     // Giới hạn trang mỗi query
    CHECKPOINT_INTERVAL: 100,      // Log progress mỗi N images
};
```

## Performance Tips (Mẹo tối ưu)

1. **API Rate Limits**: Pexels cho phép 200 requests/hour cho free account
2. **Disk Space**: 100k images (~50MB average) = ~5TB cần thiết
3. **Database Size**: Chuẩn bị ít nhất 100MB cho metadata
4. **Network**: Đảm bảo connection ổn định cho downloads lớn
5. **Memory**: Script sử dụng ~200-500MB RAM cho normal operation

## Troubleshooting (Xử lý sự cố)

### Rate Limiting
- Script tự động retry với exponential backoff
- Giảm `MAX_CONCURRENT_PAGES` nếu bị rate limit thường xuyên

### Memory Issues
- Giảm `BATCH_SIZE` và `MAX_CONCURRENT_DOWNLOADS`
- Chạy với smaller chunks và nhiều sessions

### Database Errors
- Kiểm tra connection limits trong MySQL
- Tăng `max_connections` trong MySQL config nếu cần

### Disk Space
- Monitor disk usage với `monitor-progress.js`
- Cleanup old files nếu cần thiết

## Example for 100k Images

```bash
# Setup: Tạo list 100 queries đa dạng
# Mỗi query target 1000 images = 100k total

# Method 1: Automated bulk processing
node scripts/fetch-pexels.js bulk large-queries.txt 80 13
# 100 queries × 13 pages × 80 images = 104,000 images

# Method 2: Manual batching
for i in {1..10}; do
  node scripts/fetch-pexels.js range "category_$i" 1 125 80 &
done
# 10 categories × 125 pages × 80 images = 100,000 images
```
