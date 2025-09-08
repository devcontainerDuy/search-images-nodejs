// Script để test thuật toán tìm kiếm với các ảnh mèo bị mờ
const fs = require('fs');
const path = require('path');
const { searchFullWithBuffer } = require('../services/fullSearchService');
const { analyzeImageQuality } = require('../utils/imageQuality');

async function testBlurryImageSearch() {
    console.log('=== Testing Search Algorithm with Blurry Cat Images ===\n');
    
    const uploadsDir = path.join(__dirname, '../uploads/images');
    const imageFiles = fs.readdirSync(uploadsDir).filter(f => 
        f.toLowerCase().match(/\.(jpg|jpeg|png)$/i)
    ).slice(0, 5); // Test với 5 ảnh đầu tiên
    
    for (const imageFile of imageFiles) {
        const imagePath = path.join(uploadsDir, imageFile);
        const buffer = fs.readFileSync(imagePath);
        
        console.log(`\n--- Testing with image: ${imageFile} ---`);
        
        try {
            // Phân tích chất lượng ảnh
            const quality = await analyzeImageQuality(buffer);
            console.log('Quality analysis:', {
                qualityScore: quality.qualityScore.toFixed(3),
                isBlurry: quality.isBlurry,
                isLowResolution: quality.isLowResolution,
                variance: quality.variance.toFixed(2),
                resolution: quality.resolution
            });
            
            // Test với các tham số khác nhau
            const testConfigs = [
                { name: 'Default', params: {} },
                { name: 'High CLIP Weight', params: { clipWeight: 0.85, colorWeight: 0.10, hashWeight: 0.05 } },
                { name: 'Low MinSim', params: { minSim: 0.10 } },
                { name: 'Combined Optimized', params: { 
                    clipWeight: 0.8, 
                    colorWeight: 0.12, 
                    hashWeight: 0.08,
                    minSim: 0.12,
                    topK: 10
                }}
            ];
            
            for (const config of testConfigs) {
                console.log(`\n  ${config.name} configuration:`);
                const startTime = Date.now();
                
                const result = await searchFullWithBuffer(buffer, config.params);
                const searchTime = Date.now() - startTime;
                
                console.log(`    Search time: ${searchTime}ms`);
                console.log(`    Results found: ${result.results.length}`);
                
                if (result.results.length > 0) {
                    const top3 = result.results.slice(0, 3);
                    console.log('    Top 3 results:');
                    top3.forEach((r, i) => {
                        console.log(`      ${i+1}. ${r.filename || 'Unknown'} - Score: ${r.score}, CLIP: ${r.clipSimilarity || 'N/A'}`);
                    });
                    
                    // Kiểm tra xem có kết quả liên quan đến mèo không
                    const catRelated = top3.filter(r => {
                        const filename = (r.filename || '').toLowerCase();
                        const title = (r.title || '').toLowerCase();
                        const desc = (r.description || '').toLowerCase();
                        return filename.includes('cat') || title.includes('cat') || 
                               title.includes('mèo') || desc.includes('cat') || desc.includes('mèo');
                    });
                    
                    if (catRelated.length > 0) {
                        console.log(`    ✓ Found ${catRelated.length} cat-related results in top 3`);
                    } else {
                        console.log(`    ⚠ No obvious cat-related results in top 3`);
                    }
                }
            }
            
        } catch (error) {
            console.error(`Error testing ${imageFile}:`, error.message);
        }
    }
}

// Chạy test nếu được gọi trực tiếp
if (require.main === module) {
    testBlurryImageSearch().catch(console.error);
}

module.exports = { testBlurryImageSearch };
