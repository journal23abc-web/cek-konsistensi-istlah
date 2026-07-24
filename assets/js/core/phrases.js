// core/phrases.js
// Multi-word ("two-word term") consistency — a large class of academic
// terminology is phrases, not single words ("audit committee", "sample
// size", "earnings management"), and neither the single-word case check nor
// a fixed glossary catches every way a phrase can drift:
//   - casing: "Audit Committee" vs "audit committee"
//   - word order: "audit committee" vs "committee audit"
// Both are detected here purely from adjacency in the text — no glossary,
// no AI, no dictionary of known phrases required.

const PHRASE_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'as', 'by', 'for', 'and', 'or', 'but',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those',
  'with', 'from', 'its', 'their', 'our', 'we', 'they', 'he', 'she', 'it', 'not', 'no',
  'between', 'within', 'without', 'under', 'over', 'about', 'after', 'before', 'during',
  'through', 'into', 'onto', 'upon', 'across', 'among', 'against', 'toward', 'towards',
  'since', 'until', 'per', 'via', 'than', 'then', 'so', 'such', 'also', 'both', 'each',
  'has', 'have', 'had', 'does', 'do', 'did', 'will', 'would', 'can', 'could', 'should', 'must'
]);

function isContentWord(t) {
  return /^[a-zA-Z]+$/.test(t.text) && t.text.length >= 3 && !PHRASE_STOPWORDS.has(t.text.toLowerCase());
}

// Builds two-word phrases from tokens that are exactly one space apart in the
// original text (so punctuation, line breaks, and sentence boundaries
// naturally break phrase formation without any separate boundary check) and
// both usable per the caller's exclusion predicate (headings/tables/refs).
function buildBigrams(text, tokens, isUsable) {
  const bigrams = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i], b = tokens[i + 1];
    if (!isUsable(a.start) || !isUsable(b.start)) continue;
    if (b.start - a.end !== 1) continue;
    if (!isContentWord(a) || !isContentWord(b)) continue;
    bigrams.push({ start: a.start, end: b.end, w1: a.text, w2: b.text });
  }
  return bigrams;
}

export function detectPhraseIssues(text, tokens, isUsable) {
  const bigrams = buildBigrams(text, tokens, isUsable);
  const casing = [];
  const reordering = [];

  // 1) Same two words, same order, different casing/hyphenation of either word.
  const byOrderedKey = new Map();
  for (const bg of bigrams) {
    const key = bg.w1.toLowerCase() + ' ' + bg.w2.toLowerCase();
    if (!byOrderedKey.has(key)) byOrderedKey.set(key, []);
    byOrderedKey.get(key).push(bg);
  }
  for (const [key, occ] of byOrderedKey) {
    if (occ.length < 2) continue;
    const forms = new Map();
    for (const o of occ) forms.set(o.w1 + ' ' + o.w2, (forms.get(o.w1 + ' ' + o.w2) || 0) + 1);
    if (forms.size > 1 && occ.length >= 3) {
      casing.push({
        key,
        variants: [...forms.entries()].map(([f, c]) => ({ form: f, count: c })),
        occurrences: occ.map(o => ({ text: o.w1 + ' ' + o.w2, start: o.start, end: o.end }))
      });
    }
  }

  // 2) Same two words, different order ("audit committee" vs "committee audit").
  const byBagKey = new Map();
  for (const bg of bigrams) {
    const lw1 = bg.w1.toLowerCase(), lw2 = bg.w2.toLowerCase();
    if (lw1 === lw2) continue;
    const bagKey = [lw1, lw2].sort().join(' ');
    if (!byBagKey.has(bagKey)) byBagKey.set(bagKey, new Map());
    const orderKey = lw1 + ' ' + lw2;
    const m = byBagKey.get(bagKey);
    if (!m.has(orderKey)) m.set(orderKey, { form: bg.w1 + ' ' + bg.w2, count: 0, occ: [] });
    const entry = m.get(orderKey);
    entry.count++;
    entry.occ.push({ text: bg.w1 + ' ' + bg.w2, start: bg.start, end: bg.end });
  }
  for (const [bagKey, m] of byBagKey) {
    if (m.size > 1) {
      const occ = [];
      for (const e of m.values()) occ.push(...e.occ);
      reordering.push({
        key: bagKey,
        variants: [...m.values()].map(e => ({ form: e.form, count: e.count })),
        occurrences: occ
      });
    }
  }

  return { casing, reordering };
}

// Frequent two-word phrases (regardless of casing), for handing off to the
// AI semantic layer — a much wider net than "only repeated Title Case
// phrases", since most technical two-word terms are written lowercase.
export function extractFrequentBigrams(text, tokens, isUsable, opts = {}) {
  const minCount = opts.minCount || 2;
  const maxBigrams = opts.maxBigrams || 25;
  const bigrams = buildBigrams(text, tokens, isUsable);
  const freq = new Map();
  for (const bg of bigrams) {
    const key = bg.w1.toLowerCase() + ' ' + bg.w2.toLowerCase();
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  return [...freq.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxBigrams)
    .map(([term, count]) => ({ term, count }));
}
