// Lightweight visual features for reranking: color histogram (HSV) and radial edge profile
// No OpenCV dependency; uses pure JS and image-js decode

const { decode } = require('image-js');
const { l2, cosine } = require('../utils/clip');

function rgbToHsv(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, v];
}

// use existing utils/clip l2 and cosine

async function computeImageData(buffer) {
  const img = await decode(buffer);
  const { width, height, data, channels } = img;
  const rgba = new Uint8ClampedArray(width * height * 4);
  if (channels === 4) {
    rgba.set(data);
  } else if (channels === 3) {
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i]; rgba[j+1] = data[i+1]; rgba[j+2] = data[i+2]; rgba[j+3] = 255;
    }
  } else if (channels === 1) {
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      const v = data[i]; rgba[j]=v; rgba[j+1]=v; rgba[j+2]=v; rgba[j+3]=255;
    }
  } else {
    // fallback: grey
    const g = img.grey();
    for (let i = 0, j = 0; i < g.data.length; i++, j += 4) {
      const v = g.data[i]; rgba[j]=v; rgba[j+1]=v; rgba[j+2]=v; rgba[j+3]=255;
    }
  }
  return { data: rgba, width, height };
}

function hsvHistogramFromImageData(imageData, binsH=12, binsS=3, binsV=3) {
  const { data, width, height } = imageData;
  const hist = new Float32Array(binsH * binsS * binsV);
  for (let i = 0; i < width*height; i++) {
    const r = data[4*i], g = data[4*i+1], b = data[4*i+2];
    const [h,s,v] = rgbToHsv(r,g,b);
    const hBin = Math.min(binsH-1, Math.floor(h * binsH));
    const sBin = Math.min(binsS-1, Math.floor(s * binsS));
    const vBin = Math.min(binsV-1, Math.floor(v * binsV));
    const idx = hBin * (binsS*binsV) + sBin * binsV + vBin;
    hist[idx]++;
  }
  // Normalize (L2)
  return l2(hist);
}

function radialEdgeProfile(imageData, bins=32) {
  const { data, width, height } = imageData;
  // Grayscale
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width*height; i++) {
    const r = data[4*i], g = data[4*i+1], b = data[4*i+2];
    gray[i] = 0.299*r + 0.587*g + 0.114*b;
  }
  // Sobel
  const Gx = [-1,0,1,-2,0,2,-1,0,1];
  const Gy = [-1,-2,-1,0,0,0,1,2,1];
  const mag = new Float32Array(width * height);
  for (let y = 1; y < height-1; y++) {
    for (let x = 1; x < width-1; x++) {
      let sx=0, sy=0, k=0;
      for (let j=-1;j<=1;j++) for (let i=-1;i<=1;i++) {
        const v = gray[(y+j)*width + (x+i)];
        sx += v * Gx[k]; sy += v * Gy[k]; k++;
      }
      mag[y*width + x] = Math.hypot(sx, sy);
    }
  }
  // Radial histogram weighted by edge magnitude
  const cx = (width-1)/2, cy = (height-1)/2;
  const maxR = Math.hypot(Math.max(cx, width-1-cx), Math.max(cy, height-1-cy)) || 1;
  const hist = new Float32Array(bins);
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const m = mag[y*width + x];
      if (m <= 0) continue;
      const r = Math.hypot(x - cx, y - cy) / maxR;
      const b = Math.max(0, Math.min(bins-1, Math.floor(r * bins)));
      hist[b] += m;
      total += m;
    }
  }
  if (total > 0) for (let i=0;i<bins;i++) hist[i] /= total;
  // Ring score = peak prominence
  let maxVal = 0; for (let i=0;i<bins;i++) if (hist[i] > maxVal) maxVal = hist[i];
  const ringScore = maxVal;
  return { radialHist: hist, ringScore };
}

async function computeFeatures(buffer) {
  const img = await computeImageData(buffer);
  const color = hsvHistogramFromImageData(img);
  const { radialHist, ringScore } = radialEdgeProfile(img);
  return { color, radial: radialHist, ring: ringScore };
}

function cosineSim(a, b) { return cosine(a, b); }

module.exports = { computeFeatures, cosineSim };
