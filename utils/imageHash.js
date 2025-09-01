const sharp = require('sharp');

// Compute 64-bit dHash as hex string (16 hex chars)
async function computeDHashHex(input) {
  const img = typeof input === 'string' || Buffer.isBuffer(input)
    ? sharp(input)
    : sharp(await input);

  const buf = await img
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer(); // length = 9 * 8 = 72

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
  return bytes.toString('hex');
}

// Compute dHashes for a grid of tiles (grid x grid)
async function computeTileDHashes(filePath, grid = 4) {
  const base = sharp(filePath);
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
      const width = (gx === grid - 1) ? (w - left) : tileW;
      const height = (gy === grid - 1) ? (h - top) : tileH;
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
};

