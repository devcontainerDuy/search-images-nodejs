// Script test đặc biệt để kiểm tra ranking với CLIP similarity cao
// Mock test không cần database hoặc services thực tế

// Mock một kết quả test để demo
function createMockResult(filename, clipSim, colorDist, hashDist) {
    return {
        filename,
        clipSimilarity: clipSim,
        colorDistance: colorDist,
        hashDistance: hashDist
    };
}

function testRankingLogic() {
    console.log('=== Testing New Ranking Logic ===\n');
    
    // Giả lập các kết quả với CLIP similarity khác nhau
    const mockResults = [
        createMockResult('cat_blurry.jpg', 0.745, 0.359, 25),      // Ảnh mèo mờ - CLIP cao
        createMockResult('person1.jpg', 0.520, 0.180, 45),        // Người - CLIP trung bình, color tốt
        createMockResult('person2.jpg', 0.480, 0.220, 35),        // Người khác
        createMockResult('cat_clear.jpg', 0.820, 0.120, 15),      // Mèo rõ nét
        createMockResult('random_object.jpg', 0.380, 0.890, 50),  // Vật thể khác
        createMockResult('cat_similar.jpg', 0.710, 0.450, 30),    // Mèo tương tự
    ];
    
    console.log('Mock results before ranking:');
    mockResults.forEach((r, i) => {
        console.log(`${i+1}. ${r.filename} - CLIP: ${r.clipSimilarity}, Color: ${r.colorDistance}, Hash: ${r.hashDistance}`);
    });
    
    // Áp dụng logic ranking mới
    const weights = { clipWeight: 0.85, colorWeight: 0.10, hashWeight: 0.05 };
    
    const processedResults = mockResults.map(r => {
        const clipDist = 1 - r.clipSimilarity;
        const colorN = Math.min(1, Math.max(0, r.colorDistance / 2.0));
        const hashN = Math.min(1, Math.max(0, r.hashDistance / 64));
        
        let score = weights.clipWeight * clipDist + weights.colorWeight * colorN + weights.hashWeight * hashN;
        
        // Boost cho CLIP similarity cao
        if (r.clipSimilarity >= 0.7) {
            const boost = (r.clipSimilarity - 0.7) * 0.5;
            score = score * (1 - boost);
        }
        
        return {
            ...r,
            score,
            clipDist,
            colorN,
            hashN
        };
    });
    
    // Sắp xếp theo logic mới: High CLIP first, then by score
    const highClip = processedResults.filter(x => x.clipSimilarity >= 0.7)
        .sort((a, b) => b.clipSimilarity - a.clipSimilarity || a.score - b.score);
    
    const rest = processedResults.filter(x => x.clipSimilarity < 0.7)
        .sort((a, b) => a.score - b.score);
    
    const finalRanking = [...highClip, ...rest];
    
    console.log('\nAfter applying new ranking logic:');
    finalRanking.forEach((r, i) => {
        const boost = r.clipSimilarity >= 0.7 ? ' (HIGH CLIP)' : '';
        console.log(`${i+1}. ${r.filename} - Score: ${r.score.toFixed(3)}, CLIP: ${r.clipSimilarity}, Color: ${r.colorDistance}${boost}`);
    });
    
    // Kiểm tra xem ảnh mèo có rank cao không
    const catImages = finalRanking.filter(r => r.filename.includes('cat'));
    const catRanks = catImages.map(cat => finalRanking.indexOf(cat) + 1);
    
    console.log('\nCat image rankings:', catRanks);
    
    if (catRanks[0] <= 3) {
        console.log('✅ SUCCESS: Cat images are now ranking in top 3!');
    } else {
        console.log('❌ NEED MORE TUNING: Cat images still not in top 3');
    }
}

// Giải thích logic mới
function explainNewLogic() {
    console.log('\n=== New Ranking Logic Explanation ===');
    console.log('1. Default weights: CLIP=85%, Color=10%, Hash=5%');
    console.log('2. CLIP similarity >= 0.7 gets prioritized first');
    console.log('3. Within high CLIP group: sort by CLIP similarity desc, then score asc');
    console.log('4. High CLIP similarity gets score boost (reduces final score)');
    console.log('5. Remaining results sorted by combined score');
    console.log('6. For blurry images: CLIP weight can go up to 90%');
}

if (require.main === module) {
    testRankingLogic();
    explainNewLogic();
}

module.exports = { testRankingLogic, explainNewLogic };
