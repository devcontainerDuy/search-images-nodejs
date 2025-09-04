export function bufToF32(buf) {
    // Accept Node Buffer or Uint8Array/ArrayBuffer. Ensure 4-byte alignment.
    if (buf == null) return new Float32Array(0);
    // Node Buffer case
    if (Buffer.isBuffer(buf)) {
        if (buf.byteOffset % 4 === 0) {
            return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
        }
        const len = Math.floor(buf.length / 4);
        const out = new Float32Array(len);
        for (let i = 0; i < len; i++) out[i] = buf.readFloatLE(i * 4);
        return out;
    }
    // Uint8Array case
    if (buf instanceof Uint8Array) {
        if (buf.byteOffset % 4 === 0) {
            return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
        }
        const len = Math.floor(buf.length / 4);
        const out = new Float32Array(len);
        for (let i = 0; i < len; i++) out[i] = new DataView(buf.buffer, buf.byteOffset + i * 4, 4).getFloat32(0, true);
        return out;
    }
    // ArrayBuffer
    if (buf instanceof ArrayBuffer) return new Float32Array(buf);
    return new Float32Array(0);
}

export function chiSquare(a, b) {
    let s = 0; // sum of squared diffs
    for (let i = 0; i < a.length; i++) {
        const ai = a[i],
            bi = b[i];
        const d = ai - bi;
        const denom = ai + bi || 1e-12; // tránh chia cho 0
        s += (d * d) / denom;
    }
    return s;
}

export function l2(a, b) {
    let s = 0; // sum of squared diffs
    for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        s += d * d;
    }
    return Math.sqrt(s);
}
