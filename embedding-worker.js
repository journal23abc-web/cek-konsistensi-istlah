// workers/embedding-worker.js
// Runs off the main thread so the UI never freezes while the model downloads
// or while embeddings are computed. Loaded with `new Worker(url, { type:
// 'module' })` so the dynamic import() below is allowed.
//
// Model + library are fetched from a CDN only when this worker actually
// receives an "analyze" message — i.e. only when the person clicks the
// semantic-analysis button. Nothing here runs on page load.

let extractorPromise = null;
let loadedModelId = null;

async function getExtractor(modelId) {
  if (extractorPromise && loadedModelId === modelId) return extractorPromise;
  loadedModelId = modelId;
  extractorPromise = (async () => {
    const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    env.allowLocalModels = false;
    return pipeline('feature-extraction', modelId);
  })();
  return extractorPromise;
}

function cosineSimFromNormalized(a, b) {
  // transformers.js returns L2-normalized vectors when { normalize: true }
  // is passed, so the plain dot product already equals cosine similarity.
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

self.onmessage = async (event) => {
  const { type, requestId, candidates, threshold, modelId } = event.data || {};
  if (type !== 'analyze') return;

  try {
    self.postMessage({ type: 'status', requestId, phase: 'loading-model' });
    const extractor = await getExtractor(modelId);

    self.postMessage({ type: 'status', requestId, phase: 'embedding', count: candidates.length });
    const texts = candidates.map((c) => c.term);
    const output = await extractor(texts, { pooling: 'mean', normalize: true });

    const [n, dim] = output.dims;
    const data = output.data;
    const vectors = [];
    for (let i = 0; i < n; i++) vectors.push(data.slice(i * dim, (i + 1) * dim));

    self.postMessage({ type: 'status', requestId, phase: 'comparing' });
    const pairs = [];
    const simThreshold = typeof threshold === 'number' ? threshold : 0.86;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sim = cosineSimFromNormalized(vectors[i], vectors[j]);
        if (sim >= simThreshold) {
          pairs.push({ a: candidates[i].term, b: candidates[j].term, similarity: sim });
        }
      }
    }
    pairs.sort((x, y) => y.similarity - x.similarity);
    self.postMessage({ type: 'result', requestId, pairs });
  } catch (err) {
    self.postMessage({ type: 'error', requestId, message: (err && err.message) || String(err) });
  }
};
