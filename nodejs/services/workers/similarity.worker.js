const { parentPort } = require('worker_threads');

function dot(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

parentPort.on('message', (msg) => {
  try {
    const { q, vectors, topK, minSim, start } = msg;
    const k = Math.max(1, topK|0);
    const heap = [];
    let heapMin = Infinity;
    for (let i = 0; i < vectors.length; i++) {
      const score = dot(q, vectors[i]);
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
    parentPort.postMessage({ start, top: heap });
  } catch (e) {
    parentPort.postMessage({ start: msg.start || 0, top: [] });
  }
});

