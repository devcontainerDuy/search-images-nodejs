/**
 * Chuẩn hoá L2 tại chỗ nếu là TypedArray, hoặc tạo mảng mới nếu là Array thường.
 * @param {ArrayLike<number>} vector
 * @returns {Float32Array|Float64Array} vector đã chuẩn hoá (||v|| = 1, trừ khi toàn số 0)
 */
function l2(vector) {
    let sum = 0;
    for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
    const norm = Math.sqrt(sum) || 1;

    // Nếu là TypedArray → mutate tại chỗ
    if (ArrayBuffer.isView(vector)) {
        for (let i = 0; i < vector.length; i++) vector[i] /= norm;
        return vector;
    }

    // Nếu là Array thường → trả về Float32Array mới
    const out = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
    return out;
}

/**
 * Tính độ tương đồng Cosine giữa hai vector số học.
 *
 * Công thức: cos(θ) = (A · B) / (||A|| * ||B||)
 *
 * - 1-pass, chỉ duyệt mảng 1 lần.
 * - An toàn nếu 2 vector có độ dài khác nhau (chỉ tính theo độ dài nhỏ hơn).
 * - Hỗ trợ Array<number> hoặc TypedArray (Float32Array, Float64Array, ...).
 * - Trả về 0 nếu một trong 2 vector toàn số 0.
 *
 * @param {ArrayLike<number>} vecA - Vector A
 * @param {ArrayLike<number>} vecB - Vector B
 * @returns {number} Giá trị cosine similarity trong khoảng [-1, 1]
 */
function cosine(vecA, vecB) {
    const length = Math.min(vecA.length, vecB.length);
    let dot = 0,
        a2 = 0,
        b2 = 0;
    for (let i = 0; i < length; i++) {
        const a = vecA[i];
        const b = vecB[i];
        dot += a * b;
        a2 += a * a;
        b2 += b * b;
    }
    if (a2 === 0 || b2 === 0) return 0;
    return dot / Math.sqrt(a2 * b2);
}

module.exports = { l2, cosine };
