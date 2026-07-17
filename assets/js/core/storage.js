import { DEFAULT_TERMS, STORAGE_KEY } from '../config.js';

export function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.terms)) throw new Error('invalid state');
    return {
      terms: parsed.terms.map((item) => ({ canonical: String(item.canonical || ''), variants: String(item.variants || '') })),
      caseSensitive: Boolean(parsed.caseSensitive),
      preserveCase: parsed.preserveCase !== false,
      aiProfile: parsed.aiProfile === 'lite' ? 'lite' : 'accurate',
      threshold: Number.isFinite(parsed.threshold) ? parsed.threshold : 0.84,
    };
  } catch {
    return { terms: structuredClone(DEFAULT_TERMS), caseSensitive: false, preserveCase: true, aiProfile: 'accurate', threshold: 0.84 };
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
