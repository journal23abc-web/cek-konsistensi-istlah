const MAMMOTH_URL = 'https://cdn.jsdelivr.net/npm/mammoth@1.12.0/mammoth.browser.min.js';
let mammothPromise;

function loadMammoth() {
  if (globalThis.mammoth) return Promise.resolve(globalThis.mammoth);
  if (!mammothPromise) mammothPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MAMMOTH_URL;
    script.onload = () => resolve(globalThis.mammoth);
    script.onerror = () => reject(new Error('Gagal memuat parser DOCX.'));
    document.head.appendChild(script);
  });
  return mammothPromise;
}

export async function readDocument(file) {
  if (file.size > 15 * 1024 * 1024) throw new Error('Ukuran file maksimum 15 MB.');
  const ext = file.name.split('.').pop()?.toLocaleLowerCase('en-US');
  if (ext === 'docx') {
    const mammoth = await loadMammoth();
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  const raw = await file.text();
  if (ext === 'html' || ext === 'htm') return new DOMParser().parseFromString(raw, 'text/html').body.textContent || '';
  return raw;
}
