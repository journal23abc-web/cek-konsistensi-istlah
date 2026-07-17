let worker;
let activeReject;

function ensureWorker() {
  if (!worker) worker = new Worker(new URL('../workers/semantic-worker.js', import.meta.url), { type: 'module' });
  return worker;
}

export function clusterSemantically(items, options, onProgress = () => {}) {
  const instance = ensureWorker();
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    activeReject = reject;
    const handler = (event) => {
      const data = event.data || {};
      if (data.requestId !== requestId) return;
      if (data.type === 'progress') onProgress(data.message);
      if (data.type === 'result' || data.type === 'error') {
        instance.removeEventListener('message', handler);
        activeReject = null;
        data.type === 'result' ? resolve(data) : reject(new Error(data.message));
      }
    };
    instance.addEventListener('message', handler);
    instance.postMessage({ type: 'cluster', requestId, items, options });
  });
}

export function cancelSemantic() {
  if (worker) worker.terminate();
  worker = null;
  if (activeReject) activeReject(new Error('Analisis dibatalkan.'));
  activeReject = null;
}
