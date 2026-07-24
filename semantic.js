// ai/semantic.js
// Main-thread controller for the optional AI-assisted synonym search.
//
// This is deliberately separate from core/engine.js: everything in core/ is
// deterministic, offline, and covered by tests/*.test.js. This module is
// probabilistic, needs the internet (to fetch the model once), and cannot be
// exercised by an automated test the same way — there is no way to assert
// "these two words are 88% similar" as a pass/fail unit test. Treat its
// output as candidates for a human to review, not as findings on the same
// footing as the rest of the tool.

import { computeExcludedRanges, inRanges, findReferencesSectionStart } from '../core/boundaries.js';

const ID_EN_STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'this', 'that', 'these', 'those', 'with', 'from',
  'have', 'has', 'had', 'was', 'were', 'been', 'being', 'will', 'would', 'could', 'should',
  'which', 'while', 'where', 'when', 'what', 'their', 'there', 'about', 'into', 'onto',
  'https', 'http', 'www', 'doi', 'anchor', 'ref',
  'yang', 'dan', 'atau', 'dari', 'pada', 'untuk', 'dengan', 'adalah', 'akan', 'tidak', 'juga',
  'oleh', 'sebagai', 'dapat', 'telah', 'para', 'suatu', 'sebuah', 'ini', 'itu', 'karena', 'namun',
  'serta', 'antara', 'terhadap', 'dalam', 'seperti', 'sangat', 'lebih', 'hanya', 'masih', 'sudah'
]);

export function extractCandidateTerms(text, tokens, excludeForms, opts = {}) {
  const maxWords = opts.maxWords || 40;
  const maxPhrases = opts.maxPhrases || 20;
  const maxTotal = opts.maxTotal || 60;

  // Skip the same non-prose regions the deterministic checks skip (headings,
  // table rows, the reference list) — otherwise citation URLs, anchor IDs,
  // and wrapped table-cell fragments pollute the embedding candidates.
  const excludedRanges = computeExcludedRanges(text);
  const refStart = findReferencesSectionStart(text);
  const isUsable = (pos) => (refStart < 0 || pos < refStart) && !inRanges(excludedRanges, pos);

  const freq = new Map();
  for (const t of tokens) {
    if (!isUsable(t.start)) continue;
    const w = t.text.toLowerCase();
    if (w.length < 4 || !/^[a-z]+$/i.test(w)) continue;
    if (ID_EN_STOPWORDS.has(w)) continue;
    if (excludeForms && excludeForms.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const topWords = [...freq.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords)
    .map(([w, c]) => ({ term: w, count: c }));

  const phraseRe = /\b([A-Z][a-zA-Z]+(?:[ \t]+[A-Z][a-zA-Z]+){1,3})\b/g;
  const phraseFreq = new Map();
  let m;
  while ((m = phraseRe.exec(text)) !== null) {
    if (!isUsable(m.index)) continue;
    const display = m[1];
    const key = display.toLowerCase();
    if (excludeForms && excludeForms.has(key)) continue;
    if (!phraseFreq.has(key)) phraseFreq.set(key, { term: display, count: 0 });
    phraseFreq.get(key).count++;
  }
  const topPhrases = [...phraseFreq.values()]
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxPhrases);

  return [...topWords, ...topPhrases].slice(0, maxTotal);
}

export class SemanticAnalyzer {
  constructor(workerUrl) {
    this.workerUrl = workerUrl;
    this.worker = null;
    this.requestSeq = 0;
  }

  ensureWorker() {
    if (!this.worker) {
      this.worker = new Worker(this.workerUrl, { type: 'module' });
    }
    return this.worker;
  }

  // opts: { modelId, threshold, onStatus(phase) }
  analyze(candidates, opts = {}) {
    const worker = this.ensureWorker();
    const requestId = ++this.requestSeq;
    const modelId = opts.modelId || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
    const threshold = opts.threshold == null ? 0.86 : opts.threshold;

    return new Promise((resolve, reject) => {
      const timeoutMs = opts.timeoutMs || 120000;
      const timer = setTimeout(() => {
        worker.removeEventListener('message', onMessage);
        reject(new Error('Semantic analysis timed out. Check your internet connection and try again.'));
      }, timeoutMs);

      function onMessage(e) {
        const msg = e.data || {};
        if (msg.requestId !== requestId) return;
        if (msg.type === 'status') {
          if (opts.onStatus) opts.onStatus(msg.phase);
          return;
        }
        if (msg.type === 'result') {
          clearTimeout(timer);
          worker.removeEventListener('message', onMessage);
          resolve(msg.pairs);
          return;
        }
        if (msg.type === 'error') {
          clearTimeout(timer);
          worker.removeEventListener('message', onMessage);
          reject(new Error(msg.message || 'Semantic analysis failed.'));
        }
      }

      worker.addEventListener('message', onMessage);
      worker.postMessage({ type: 'analyze', requestId, candidates, threshold, modelId });
    });
  }

  terminate() {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }
}
