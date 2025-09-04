// Use transformers' bundled sharp to ensure a single libvips instance
const sharp = require('@xenova/transformers/node_modules/sharp');

// Compute a compact HSV histogram: h(8) x s(4) x v(4) = 128 bins
// Returns Float32Array normalized to sum=1, and JSON-serializable array
async function computeColorHistogram(input, { hBins = 8, sBins = 4, vBins = 4, sample = 128 } = {}) {
  const img = typeof input === 'string' || Buffer.isBuffer(input)
    ? sharp(input)
    : sharp(await input);

  // Downscale to reduce cost, extract RGB
  const { width, height } = await img.metadata();
  const target = width && height ? Math.min(sample, Math.max(width, height)) : sample;
  const buf = await img.resize(target, target, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const data = buf.data; // RGB
  const n = data.length / 3;
  const bins = hBins * sBins * vBins;
  const hist = new Float32Array(bins);

  for (let i = 0; i < n; i++) {
    const r = data[i * 3] / 255;
    const g = data[i * 3 + 1] / 255;
    const b = data[i * 3 + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;
    const delta = max - min;
    const s = max === 0 ? 0 : (delta / max);
    let h = 0;
    if (delta !== 0) {
      if (max === r) h = (g - b) / delta + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h /= 6; // 0..1
    }
    const hi = Math.min(hBins - 1, Math.floor(h * hBins));
    const si = Math.min(sBins - 1, Math.floor(s * sBins));
    const vi = Math.min(vBins - 1, Math.floor(v * vBins));
    const idx = hi * (sBins * vBins) + si * vBins + vi;
    hist[idx] += 1;
  }

  // normalize
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += hist[i];
  if (sum > 0) {
    for (let i = 0; i < bins; i++) hist[i] /= sum;
  }
  return { vector: Array.from(hist), bins };
}

// Chi-square distance between two normalized histograms (lower is better)
function chiSquareDistance(a, b) {
  const len = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < len; i++) {
    const s = a[i] + b[i];
    if (s > 0) {
      const diff = a[i] - b[i];
      d += (diff * diff) / s;
    }
  }
  return d;
}

module.exports = {
  computeColorHistogram,
  chiSquareDistance,
};

// Compute center-crop histograms for multiple ratios
// Returns an array of { variant: 'center_0.8', bins, vector }
async function computeCenterColorHistograms(input, ratios = [0.8, 0.6, 0.4], opts = {}) {
  const base = (typeof input === 'string' || Buffer.isBuffer(input)) ? sharp(input) : sharp(await input);
  const { width = 0, height = 0 } = await base.metadata();
  if (!width || !height) return [];
  const out = [];
  for (const r of ratios) {
    const w = Math.max(1, Math.floor(width * r));
    const h = Math.max(1, Math.floor(height * r));
    const left = Math.max(0, Math.floor((width - w) / 2));
    const top = Math.max(0, Math.floor((height - h) / 2));
    const buf = await base.clone().extract({ left, top, width: w, height: h }).toBuffer();
    const { vector, bins } = await computeColorHistogram(buf, opts);
    out.push({ variant: `center_${r}`, bins, vector });
  }
  return out;
}

module.exports.computeCenterColorHistograms = computeCenterColorHistograms;
