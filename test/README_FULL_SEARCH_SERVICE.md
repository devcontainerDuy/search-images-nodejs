# 🔍 Full Search Service - Thuật Toán Tìm Kiếm Hình Ảnh Multi-Modal

## 📖 Tổng quan

**Full Search Service** là một thuật toán tìm kiếm hình ảnh tiên tiến sử dụng **3 phương pháp kết hợp**:
- 🧠 **CLIP** (Ngữ nghĩa/Semantic) - 85%
- 🎨 **Color Histogram** (Màu sắc) - 10%  
- 🔢 **Hash (dHash)** (Cấu trúc) - 5%

Thuật toán được thiết kế để **ưu tiên ngữ nghĩa** giống như Google Reverse Image Search, đặc biệt hiệu quả với ảnh mờ hoặc chất lượng kém.

---

## 🚀 Tính năng chính

### ✨ **Multi-Modal Search**
- **CLIP Embedding**: Hiểu ngữ nghĩa và nội dung ảnh
- **Color Analysis**: So sánh phân bố màu sắc (global + center crops)
- **Hash Matching**: Phát hiện near-duplicates và cấu trúc tương tự

### 🎯 **Smart Ranking System**
```
Priority 1: High CLIP Matches (similarity ≥ 0.7)
Priority 2: Strong Hash Matches (distance ≤ 6)  
Priority 3: Regular Combined Score Matches
```

### 🧬 **Adaptive Quality Processing**
- Tự động phân tích chất lượng ảnh (mờ, độ phân giải, độ tương phản)
- Điều chỉnh trọng số và threshold dựa trên chất lượng
- Xử lý đặc biệt cho ảnh kém chất lượng

### 🔄 **Robust Fallback Mechanisms**
- ANN Index fallback to full DB scan
- CLIP restriction fallback to global search
- Expansion search khi candidates ít

---

## 🏗️ Kiến trúc hệ thống

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Input Image   │───►│ Quality Analysis │───►│ Param Adjustment │
└─────────────────┘    └──────────────────┘    └─────────────────┘
          │                                              │
          ▼                                              ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ CLIP Embedding  │    │ Color Histogram  │    │   Hash dHash    │
│   (Semantic)    │    │   (Color Dist)   │    │  (Structure)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
          │                       │                       │
          └───────────────────────┼───────────────────────┘
                                  ▼
                     ┌─────────────────────┐
                     │   Candidate Pool    │
                     │  (Map merging)      │
                     └─────────────────────┘
                                  │
                                  ▼
                     ┌─────────────────────┐
                     │   Score & Rank      │
                     │ (3-tier priority)   │
                     └─────────────────────┘
                                  │
                                  ▼
                     ┌─────────────────────┐
                     │   Final Results     │
                     │    (Top K)          │
                     └─────────────────────┘
```

---

## 🔧 API Reference

### **searchFullWithBuffer(buffer, query)**
Tìm kiếm từ ảnh upload (Buffer)

```javascript
const result = await searchFullWithBuffer(imageBuffer, {
    topK: 20,                    // Số kết quả trả về
    minSim: 0.15,               // Ngưỡng CLIP similarity tối thiểu
    clipWeight: 0.85,           // Trọng số CLIP (0-1)
    colorWeight: 0.10,          // Trọng số Color (0-1)  
    hashWeight: 0.05,           // Trọng số Hash (0-1)
    restrictToClip: true,       // Chỉ tính color/hash trên CLIP candidates
    colorVariant: "multi",      // "multi" | "global"
    combine: "weighted"         // "weighted" | "lexi"
});
```

### **searchFullByImageId(imageId, query)**
Tìm kiếm từ ảnh có sẵn trong DB

```javascript
const result = await searchFullByImageId(123, {
    topK: 20,
    minSim: 0.15
    // ... các tham số tương tự
});
```

---

## 📊 Cấu trúc kết quả

```javascript
{
    results: [
        {
            imageId: 456,
            url: "/uploads/images/cat.jpg",
            filename: "cat.jpg", 
            original_name: "my_cat_photo.jpg",
            title: "Cute cat",
            description: "A fluffy cat",
            
            // Scores
            clipSimilarity: 0.845,      // [0-1] cao = tốt
            colorDistance: 0.234,       // [0-2] thấp = tốt  
            hashDistance: 12,           // [0-64] thấp = tốt
            score: 0.156,              // Combined score (thấp = tốt)
            
            // Internal (for debugging)
            _clipDist: 0.155,
            _colorDist: 0.117, 
            _hashDist: 0.1875
        }
    ],
    info: {
        topK: 20,
        weights: { clipWeight: 0.85, colorWeight: 0.10, hashWeight: 0.05 },
        minSim: 0.15,
        qualityAnalysis: {
            qualityScore: 0.8,
            isBlurry: false,
            variance: 245.6
        }
    }
}
```

---

## ⚙️ Vòng đời xử lý chi tiết

### **Phase 1: Pre-processing** ⏱️ ~50-100ms
```javascript
// 1. Phân tích chất lượng ảnh
const quality = await analyzeImageQuality(buffer);
// → Đánh giá: variance, resolution, blur detection

// 2. Điều chỉnh tham số adaptive  
const adjusted = adjustSearchParams(query, quality);
// → Ảnh mờ: tăng CLIP weight, giảm minSim

// 3. Normalize options
const opts = buildOptions(adjusted);
// → Chuẩn hóa weights, set candidate counts
```

### **Phase 2: CLIP Processing** ⏱️ ~200-500ms
```javascript
// 1. Compute embedding
const qVec = await clip.computeClipEmbedding(buffer);
// → Vector 512-dim (CLIP-ViT-Base-Patch32)

// 2. Search candidates
if (ann.isAvailable()) {
    // Fast ANN search (~50ms)
    results = await ann.annSearch(qVec, opts.clipCand);
} else {
    // Full DB scan (~300-800ms)
    // Cosine similarity với tất cả embeddings
}

// 3. Filter by minSim threshold
candidates = results.filter(r => r.similarity >= opts.minSim);
```

### **Phase 3: Color Processing** ⏱️ ~100-300ms
```javascript
// 1. Compute query histograms
const globalHist = await colors.computeColorHistogram(buffer);
const centerHists = await computeCenterColorHistograms(buffer, [0.8, 0.6, 0.4]);

// 2. Compare với candidates
for (candidate of colorCandidates) {
    // Chi-square distance cho mỗi histogram
    let bestDist = Infinity;
    for (qHist of queryHistograms) {
        const dist = colors.chiSquareDistance(qHist.vector, candidate.hist);
        if (dist < bestDist) bestDist = dist;
    }
}
```

### **Phase 4: Hash Processing** ⏱️ ~80-200ms  
```javascript
// 1. Compute multiple query hashes
const globalHash = await hash.computeDHashHex(buffer);          // 1 hash
const tileHashes = await hash.computeTileDHashes(buffer, [3,4,5]); // 9+16+25 = 50 hashes  
const overlapHashes = await hash.computeOverlappingTileDHashes(buffer); // ~25 hashes

// 2. Compare với DB hashes
for (candidate of hashCandidates) {
    let bestDist = Infinity;
    for (qHash of queryHashes) {
        const dist = hash.hammingDistanceHex(qHash, candidate.hash);
        if (dist < bestDist) bestDist = dist;
        if (bestDist === 0) break; // Perfect match
    }
}
```

### **Phase 5: Scoring & Ranking** ⏱️ ~10-30ms
```javascript
// 1. Calculate combined scores
const score = weights.clipWeight * clipDist + 
              weights.colorWeight * colorNorm + 
              weights.hashWeight * hashNorm;

// 2. Apply CLIP boost
if (clipSimilarity >= 0.7) {
    const boost = (clipSimilarity - 0.7) * 0.5;
    score = score * (1 - boost); // Giảm score = rank cao hơn
}

// 3. 3-tier ranking
const highClip = candidates.filter(x => x.clipSimilarity >= 0.7)
    .sort((a,b) => b.clipSimilarity - a.clipSimilarity);

const strongHash = candidates.filter(x => x.hashDistance <= 6 && x.clipSimilarity < 0.7)
    .sort((a,b) => a.hashDistance - b.hashDistance);
    
const regular = remaining.sort((a,b) => a.score - b.score);

// 4. Final merge
return [...highClip, ...strongHash, ...regular].slice(0, topK);
```

---

## 🔬 Fallback Mechanisms

### **1. ANN Fallback**
```javascript
if (ann.isAvailable()) {
    results = await ann.annSearch(qVec, clipCand);
} else {
    // Fallback: Full database scan
    results = await fullEmbeddingScan(qVec);
}
```

### **2. Restriction Fallback**  
```javascript
if (opts.restrictToClip && opts.ensureColorFallback) {
    // Thêm top color matches từ toàn DB
    const fallback = await colorDistancesForCandidates(buffer, null);
    candidates.merge(fallback.slice(0, colorFallback));
}
```

### **3. Low Candidates Expansion**
```javascript
if (clipIdSet.size < 10) {
    console.log("Low CLIP candidates, expanding search");
    const expanded = await colorDistancesForCandidates(buffer, null);
    candidates.merge(expanded.slice(0, 50));
}
```

---

## 📈 Performance Metrics

### **Timing Breakdown**
| Phase | Fast Setup | Average | Heavy Load |
|-------|------------|---------|------------|
| Quality Analysis | 20ms | 50ms | 100ms |
| CLIP Processing | 150ms | 300ms | 800ms |
| Color Processing | 80ms | 150ms | 400ms |
| Hash Processing | 60ms | 120ms | 250ms |
| Scoring & Ranking | 5ms | 15ms | 40ms |
| **Total** | **315ms** | **635ms** | **1590ms** |

### **Memory Usage**
- CLIP candidates: ~150 objects × 200B = 30KB
- Color candidates: ~80 objects × 150B = 12KB  
- Hash candidates: ~80 objects × 100B = 8KB
- **Total candidates pool**: ~50KB

### **Database Queries**
```sql
-- CLIP embeddings (if no ANN)
SELECT e.image_id, e.embedding, i.filename, i.title, i.description 
FROM image_embeddings e JOIN images i ON i.id = e.image_id 
WHERE e.model = ?

-- Color histograms (restricted)
SELECT ic.image_id, ic.variant, ic.histogram, i.filename
FROM image_colors ic JOIN images i ON i.id = ic.image_id  
WHERE ic.image_id IN (?, ?, ?, ...)

-- Hash signatures (restricted)
SELECT ih.image_id, ih.tile_index, ih.hash, i.filename
FROM image_hashes ih JOIN images i ON i.id = ih.image_id
WHERE ih.image_id IN (?, ?, ?, ...)
```

---

## 🎛️ Tuning Parameters

### **Cho ảnh chất lượng cao**
```javascript
{
    clipWeight: 0.8,
    colorWeight: 0.15, 
    hashWeight: 0.05,
    minSim: 0.18,
    topK: 20
}
```

### **Cho ảnh mờ/chất lượng kém**
```javascript
{
    clipWeight: 0.9,     // Tăng cao để ưu tiên ngữ nghĩa
    colorWeight: 0.05,   // Giảm vì màu có thể không chính xác
    hashWeight: 0.05,
    minSim: 0.12,        // Giảm threshold
    topK: 30             // Lấy nhiều kết quả hơn
}
```

### **Cho exact duplicate detection**
```javascript
{
    clipWeight: 0.3,
    colorWeight: 0.2,
    hashWeight: 0.5,     // Tăng hash để bắt duplicates
    hashStrongThreshold: 3,
    minSim: 0.1
}
```

---

## 🐛 Debugging & Monitoring

### **Console Logs**
```
Image quality analysis: { qualityScore: 0.8, isBlurry: false }
CLIP embedding computed successfully, vector length: 512
CLIP candidates found: 45
Top 3 CLIP candidates: [...]
Color candidates found: 32
Color fallback candidates: 15
Hash candidates found: 28
Hash fallback candidates: 12
Final search results summary:
- Total candidates processed: 67
- High CLIP matches (>= 0.7): 3
- Strong hash matches: 1  
- Regular matches: 63
- Returned top 20 results
```

### **Error Handling**
```javascript
try {
    const clipRes = await clipCandidatesFromVector(qVec, opts);
} catch (e) {
    console.error("CLIP search error:", e);
    // Continue với color/hash search
}
```

---

## 🔧 Configuration

### **Environment Variables**
```bash
CLIP_MODEL_ID=Xenova/clip-vit-base-patch32
TRANSFORMERS_CACHE=./cache
```

### **Database Schema**
```sql
-- Images table
CREATE TABLE images (
    id INT PRIMARY KEY,
    filename VARCHAR(255),
    file_path VARCHAR(512),
    title VARCHAR(255),
    description TEXT
);

-- CLIP embeddings
CREATE TABLE image_embeddings (
    image_id INT,
    model VARCHAR(100),
    dim INT,
    embedding JSON,
    INDEX(image_id, model)
);

-- Color histograms  
CREATE TABLE image_colors (
    image_id INT,
    variant VARCHAR(50), -- 'global', 'center_80', etc.
    histogram JSON,
    INDEX(image_id)
);

-- Hash signatures
CREATE TABLE image_hashes (
    image_id INT, 
    tile_index INT,      -- -1 for global, 0+ for tiles
    grid INT,            -- 3, 4, 5 for tile size
    hash VARCHAR(64),    -- hex string
    stride FLOAT,        -- for overlapping tiles
    INDEX(image_id)
);
```

---

## 📝 Examples

### **Basic Search**
```javascript
const fs = require('fs');
const { searchFullWithBuffer } = require('./services/fullSearchService');

const imageBuffer = fs.readFileSync('query_image.jpg');
const results = await searchFullWithBuffer(imageBuffer, {
    topK: 10
});

console.log(`Found ${results.results.length} similar images`);
results.results.forEach((img, i) => {
    console.log(`${i+1}. ${img.filename} - CLIP: ${img.clipSimilarity}`);
});
```

### **Advanced Search với custom weights**
```javascript
const results = await searchFullWithBuffer(imageBuffer, {
    topK: 20,
    clipWeight: 0.9,
    colorWeight: 0.05, 
    hashWeight: 0.05,
    minSim: 0.1,
    restrictToClip: false,  // Search toàn bộ DB
    colorVariant: "global"  // Chỉ dùng global histogram
});
```

### **Search by existing image ID**
```javascript
const results = await searchFullByImageId(123, {
    topK: 15,
    minSim: 0.2
});
```

---

## 🚨 Troubleshooting

### **Vấn đề phổ biến**

**1. CLIP search chậm**
```javascript
// Kiểm tra ANN index
if (!ann.isAvailable()) {
    console.log("ANN index not available, using full scan");
    // Rebuild ANN index
}
```

**2. Kết quả không relevant**
```javascript
// Kiểm tra trọng số
console.log("Current weights:", opts.weights);
// Điều chỉnh minSim
console.log("Current minSim:", opts.minSim);
```

**3. Memory issues**
```javascript
// Giảm candidate counts
const opts = buildOptions({
    ...query,
    clipCand: 50,  // Thay vì 150
    colorCand: 30, // Thay vì 80
    hashCand: 30   // Thay vì 80
});
```

**4. Sharp module errors**
```bash
npm install --include=optional sharp
# hoặc
npm install --os=win32 --cpu=x64 sharp
```

---

## 📚 References

- **CLIP Paper**: [Learning Transferable Visual Representations](https://arxiv.org/abs/2103.00020)
- **Perceptual Hashing**: [dHash Algorithm](http://www.hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html)  
- **Color Histograms**: [Chi-square distance](https://en.wikipedia.org/wiki/Chi-squared_test)
- **ANN Search**: [Approximate Nearest Neighbors](https://en.wikipedia.org/wiki/Nearest_neighbor_search#Approximate_nearest_neighbor)

---

## 👥 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Made with ❤️ for intelligent image search**
