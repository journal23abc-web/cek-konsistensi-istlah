// core/tokenizer.js
// Tokenizing and small text utilities. No dependencies, pure functions.

export function tokenize(text) {
  const tokens = [];
  const re = /[\p{L}\p{N}_-]+/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function contextSnippet(text, start, end, span = 45) {
  const from = Math.max(0, start - span);
  const to = Math.min(text.length, end + span);
  let snippet = text.slice(from, to).replace(/\s+/g, ' ').trim();
  if (from > 0) snippet = '\u2026' + snippet;
  if (to < text.length) snippet = snippet + '\u2026';
  return snippet;
}
