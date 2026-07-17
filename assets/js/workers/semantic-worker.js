import { AI_PROFILES } from '../config.js';

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm';
const pipelines = new Map();

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

function lexicalKey(value) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]/gu, '');
}

function clusterCompleteLink(items, vectors, threshold) {
  const similarity = vectors.map((a, i) => vectors.map((b, j) => i === j ? 1 : cosine(a, b)));
  let clusters = items.map((_, index) => [index]);
  while (true) {
    let best = null;
    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        const scores = [];
        for (const a of clusters[i]) for (const b of clusters[j]) {
          if (lexicalKey(items[a].term) === lexicalKey(items[b].term)) continue;
          scores.push(similarity[a][b]);
        }
        if (!scores.length) continue;
        const min = Math.min(...scores);
        const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
        if (min >= threshold - 0.025 && avg >= threshold && (!best || avg > best.avg)) best = { i, j, avg };
      }
    }
    if (!best) break;
    clusters[best.i] = [...clusters[best.i], ...clusters[best.j]];
    clusters.splice(best.j, 1);
  }
  return clusters.filter((group) => group.length > 1).map((indices) => {
    const pairScores = [];
    for (let i = 0; i < indices.length; i += 1) for (let j = i + 1; j < indices.length; j += 1) pairScores.push(similarity[indices[i]][indices[j]]);
    return {
      items: indices.map((index) => items[index]),
      confidence: pairScores.reduce((sum, value) => sum + value, 0) / pairScores.length,
    };
  }).sort((a, b) => b.confidence - a.confidence);
}

async function getPipeline(profileName, progress) {
  if (pipelines.has(profileName)) return pipelines.get(profileName);
  const profile = AI_PROFILES[profileName] || AI_PROFILES.accurate;
  const promise = (async () => {
    const { pipeline, env } = await import(TRANSFORMERS_URL);
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    const options = { progress_callback: (event) => {
      if (event.status === 'progress') progress(`Mengunduh model: ${event.file || ''} ${Math.round(event.progress || 0)}%`);
    }};
    if ('gpu' in navigator) options.device = 'webgpu';
    try {
      return await pipeline('feature-extraction', profile.model, options);
    } catch (error) {
      if (options.device) {
        delete options.device;
        progress('WebGPU tidak tersedia; beralih ke WASM.');
        return pipeline('feature-extraction', profile.model, options);
      }
      throw error;
    }
  })();
  pipelines.set(profileName, promise);
  return promise;
}

self.addEventListener('message', async (event) => {
  const { type, requestId, items, options = {} } = event.data || {};
  if (type !== 'cluster') return;
  const progress = (message) => self.postMessage({ type: 'progress', requestId, message });
  try {
    const profileName = options.profile === 'lite' ? 'lite' : 'accurate';
    const profile = AI_PROFILES[profileName];
    progress('Menyiapkan model AI lokal…');
    const extractor = await getPipeline(profileName, progress);
    progress('Menghitung embedding kandidat istilah…');
    const limited = items.slice(0, 40);
    const input = limited.map((item) => profile.template(item.term));
    const output = await extractor(input, { pooling: 'mean', normalize: true });
    const groups = clusterCompleteLink(limited, output.tolist(), Number(options.threshold) || profile.threshold);
    self.postMessage({ type: 'result', requestId, groups, model: profile.label });
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error?.message || String(error) });
  }
});
