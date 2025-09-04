// Use transformers' bundled sharp to ensure a single libvips instance
const sharp = require("@xenova/transformers/node_modules/sharp");

// Compute 64-bit dHash as hex string (16 hex chars)
async function computeDHashHex(input) {
    const img = typeof input === "string" || Buffer.isBuffer(input) ? sharp(input) : sharp(await input);
    const buf = await img.greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer(); // length = 9 * 8 = 72

    // Build 64 bits row-wise comparing adjacent pixels
    const bytes = Buffer.alloc(8, 0);
    let bitIndex = 0;
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const leftIdx = y * 9 + x;
            const rightIdx = leftIdx + 1;
            const bit = buf[leftIdx] > buf[rightIdx] ? 1 : 0;
            const bytePos = Math.floor(bitIndex / 8);
            const bitPosInByte = 7 - (bitIndex % 8); // MSB first
            bytes[bytePos] |= (bit & 1) << bitPosInByte;
            bitIndex++;
        }
    }
    return bytes.toString("hex");
}

// Compute dHashes for a grid of tiles (grid x grid)
async function computeTileDHashes(input, grid = 4) {
    const base = typeof input === "string" || Buffer.isBuffer(input) ? sharp(input) : sharp(await input);
    const meta = await base.metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (!w || !h) return [];

    const hashes = [];
    const tileW = Math.max(1, Math.floor(w / grid));
    const tileH = Math.max(1, Math.floor(h / grid));

    for (let gy = 0; gy < grid; gy++) {
        for (let gx = 0; gx < grid; gx++) {
            const left = gx * tileW;
            const top = gy * tileH;
            const width = gx === grid - 1 ? w - left : tileW;
            const height = gy === grid - 1 ? h - top : tileH;
            const tileBuf = await base.clone().extract({ left, top, width, height }).toBuffer();
            const hHex = await computeDHashHex(tileBuf);
            hashes.push(hHex);
        }
    }
    return hashes;
}

// Compute overlapping tiles dHashes with given overlap ratio (0..0.9)
async function computeOverlappingTileDHashes(input, grid = 4, overlap = 0.5) {
    const base = typeof input === "string" || Buffer.isBuffer(input) ? sharp(input) : sharp(await input);
    const meta = await base.metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (!w || !h) return [];

    const hashes = [];
    const tileW = Math.max(1, Math.floor(w / grid));
    const tileH = Math.max(1, Math.floor(h / grid));

    const stepW = Math.max(1, Math.floor(tileW * (1 - overlap)));
    const stepH = Math.max(1, Math.floor(tileH * (1 - overlap)));

    // Generate start positions ensuring last window ends at image boundary
    const xs = [];
    for (let x = 0; x <= w - tileW; x += stepW) xs.push(x);
    if (xs[xs.length - 1] !== w - tileW) xs.push(Math.max(0, w - tileW));

    const ys = [];
    for (let y = 0; y <= h - tileH; y += stepH) ys.push(y);
    if (ys[ys.length - 1] !== h - tileH) ys.push(Math.max(0, h - tileH));

    for (const top of ys) {
        for (const left of xs) {
            const width = tileW;
            const height = tileH;
            const tileBuf = await base.clone().extract({ left, top, width, height }).toBuffer();
            const hHex = await computeDHashHex(tileBuf);
            hashes.push(hHex);
        }
    }
    return hashes;
}

module.exports = {
    computeDHashHex,
    computeTileDHashes,
    computeOverlappingTileDHashes,
};
