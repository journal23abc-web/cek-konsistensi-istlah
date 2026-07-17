export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeKey(value, caseSensitive = false) {
  const normalized = String(value).normalize('NFKC').trim().replace(/\s+/g, ' ');
  return caseSensitive ? normalized : normalized.toLocaleLowerCase('id-ID');
}

export function phrasePattern(value) {
  return String(value)
    .trim()
    .split(/\s+/u)
    .map(escapeRegExp)
    .join('\\s+');
}

export function lineColumnAt(text, index) {
  const before = text.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

export function contextAround(text, start, end, radius = 42) {
  const left = Math.max(0, start - radius);
  const right = Math.min(text.length, end + radius);
  return `${left > 0 ? '…' : ''}${text.slice(left, right).replace(/\s+/g, ' ')}${right < text.length ? '…' : ''}`;
}

export function applyCasePattern(canonical, matched) {
  if (!canonical || !matched) return canonical;
  const intentionalCase = /[A-Z].*[A-Z]/.test(canonical) || /[a-z][A-Z]/.test(canonical);
  if (intentionalCase) return canonical;
  if (matched === matched.toUpperCase() && /[A-Z]/i.test(matched)) return canonical.toUpperCase();
  if (/^\p{Lu}/u.test(matched) && /^\p{Ll}/u.test(canonical)) {
    return canonical[0].toLocaleUpperCase('id-ID') + canonical.slice(1);
  }
  return canonical;
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
