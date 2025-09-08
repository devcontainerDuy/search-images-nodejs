// Utility để đánh giá chất lượng ảnh và điều chỉnh tham số tìm kiếm
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.warn('Sharp not available, using fallback image quality analysis');
    sharp = null;
}

async function analyzeImageQuality(bufferOrPath) {
    if (!sharp) {
        // Fallback analysis without Sharp
        return {
            qualityScore: 0.5, // Default medium quality
            isBlurry: false,
            isLowResolution: false,
            variance: 100,
            width: 800,
            height: 600,
            resolution: 480000,
            aspectRatio: 1.33
        };
    }
    
    try {
        let sharpInstance;
        if (Buffer.isBuffer(bufferOrPath)) {
            sharpInstance = sharp(bufferOrPath);
        } else {
            sharpInstance = sharp(bufferOrPath);
        }

        const metadata = await sharpInstance.metadata();
        const stats = await sharpInstance.stats();
        
        // Tính toán các chỉ số chất lượng
        const resolution = metadata.width * metadata.height;
        const aspectRatio = metadata.width / metadata.height;
        
        // Đánh giá độ mờ dựa trên variance của gradient
        const edgeBuffer = await sharpInstance
            .grayscale()
            .convolve({
                width: 3,
                height: 3,
                kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
            })
            .raw()
            .toBuffer();
        
        // Tính variance để đánh giá độ sắc nét
        const pixels = new Uint8Array(edgeBuffer);
        let sum = 0;
        let sumSquares = 0;
        for (let i = 0; i < pixels.length; i++) {
            sum += pixels[i];
            sumSquares += pixels[i] * pixels[i];
        }
        const mean = sum / pixels.length;
        const variance = (sumSquares / pixels.length) - (mean * mean);
        
        // Đánh giá chất lượng tổng thể
        const qualityScore = calculateQualityScore(resolution, variance, stats);
        
        return {
            width: metadata.width,
            height: metadata.height,
            resolution,
            aspectRatio,
            variance,
            qualityScore,
            isBlurry: variance < 100, // Ngưỡng có thể điều chỉnh
            isLowResolution: resolution < 100000, // < 100k pixels
            stats
        };
    } catch (error) {
        console.error('Error analyzing image quality:', error);
        return {
            qualityScore: 0.5, // Default medium quality
            isBlurry: false,
            isLowResolution: false,
            variance: 0
        };
    }
}

function calculateQualityScore(resolution, variance, stats) {
    let score = 1.0;
    
    // Giảm điểm nếu độ phân giải thấp
    if (resolution < 50000) score *= 0.6;
    else if (resolution < 100000) score *= 0.8;
    
    // Giảm điểm nếu ảnh mờ (variance thấp)
    if (variance < 50) score *= 0.5;
    else if (variance < 100) score *= 0.7;
    else if (variance < 200) score *= 0.9;
    
    // Kiểm tra độ tương phản
    if (stats && stats.channels) {
        const avgStdDev = stats.channels.reduce((sum, ch) => sum + (ch.std || 0), 0) / stats.channels.length;
        if (avgStdDev < 20) score *= 0.8; // Độ tương phản thấp
    }
    
    return Math.max(0.1, Math.min(1.0, score));
}

function adjustSearchParams(baseParams, qualityAnalysis) {
    const adjustedParams = { ...baseParams };
    
    if (qualityAnalysis.isBlurry || qualityAnalysis.qualityScore < 0.6) {
        // Điều chỉnh cho ảnh chất lượng kém - tăng CLIP weight lên rất cao
        adjustedParams.minSim = Math.max(0.10, (baseParams.minSim || 0.15) - 0.05);
        adjustedParams.clipWeight = Math.min(0.90, (baseParams.clipWeight || 0.85) + 0.05);
        adjustedParams.colorWeight = Math.max(0.05, (baseParams.colorWeight || 0.10) - 0.03);
        adjustedParams.hashWeight = Math.max(0.05, (baseParams.hashWeight || 0.05));
        adjustedParams.topK = Math.max(30, baseParams.topK || 20); // Lấy nhiều kết quả hơn
        
        console.log('Adjusted params for low quality image:', {
            qualityScore: qualityAnalysis.qualityScore,
            isBlurry: qualityAnalysis.isBlurry,
            adjustments: {
                minSim: adjustedParams.minSim,
                clipWeight: adjustedParams.clipWeight,
                colorWeight: adjustedParams.colorWeight
            }
        });
    }
    
    return adjustedParams;
}

module.exports = {
    analyzeImageQuality,
    adjustSearchParams,
    calculateQualityScore
};
