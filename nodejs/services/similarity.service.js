// Parallel top-K cosine similarity using worker_threads (optional)
// Falls back to single-threaded heap-based top-K if SIM_WORKERS <= 1

const os = require('os');
const path = require('path');

// Minimal fast dot for normalized vectors
function dot(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function topKSync(query, vectors, k, minSim) {
  const heap = [];
  let heapMin = Infinity;
  for (let i = 0; i < vectors.length; i++) {
    const score = dot(query, vectors[i]);
    if (score < minSim) continue;
    if (heap.length < k) {
      heap.push({ idx: i, score });
      if (score < heapMin) heapMin = score;
    } else if (score > heapMin) {
      let minIdx = 0;
      for (let j = 1; j < heap.length; j++) if (heap[j].score < heap[minIdx].score) minIdx = j;
      heap[minIdx] = { idx: i, score };
      heapMin = heap[0].score;
      for (let j = 1; j < heap.length; j++) if (heap[j].score < heapMin) heapMin = heap[j].score;
    }
  }
  heap.sort((a, b) => b.score - a.score);
  return heap;
}

async function topKParallel(query, vectors, k, minSim, workers) {
  const { Worker } = require('worker_threads');
  const workerCount = Math.max(1, workers);
  const n = vectors.length;
  if (n === 0) return [];
  const chunkSize = Math.ceil(n / workerCount);
  const workerFile = path.join(__dirname, 'workers', 'similarity.worker.js');

  const tasks = [];
  for (let w = 0; w < workerCount; w++) {
    const start = w * chunkSize;
    if (start >= n) break;
    const end = Math.min(n, start + chunkSize);
    const slice = vectors.slice(start, end);
    tasks.push(new Promise((resolve, reject) => {
      const worker = new Worker(workerFile);
      worker.once('message', (msg) => { worker.terminate(); resolve(msg); });
      worker.once('error', (err) => { worker.terminate(); reject(err); });
      worker.postMessage({ q: query, start, topK: k, minSim, vectors: slice });
    }));
  }

  let combined = [];
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && Array.isArray(r.value.top)) {
      const { start, top } = r.value;
      for (const t of top) combined.push({ idx: start + t.idx, score: t.score });
    }
  }
  // final top-K on the union set
  combined.sort((a, b) => b.score - a.score);
  return combined.slice(0, k);
}

async function parallelTopK(query, vectors, k, minSim) {
  const maxWorkers = parseInt(process.env.SIM_WORKERS || '0', 10);
  if (!Number.isFinite(maxWorkers) || maxWorkers <= 1) {
    return topKSync(query, vectors, k, minSim);
  }
  const workers = Math.min(maxWorkers, Math.max(1, (os.cpus() || []).length || 1));
  try {
    return await topKParallel(query, vectors, k, minSim, workers);
  } catch (e) {
    // Fallback to sync on any worker error
    console.warn('SIM_WORKERS parallel failed, falling back to sync:', e.message);
    return topKSync(query, vectors, k, minSim);
  }
}

module.exports = { parallelTopK };

