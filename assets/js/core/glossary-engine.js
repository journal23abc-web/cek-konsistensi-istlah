import { applyCasePattern, contextAround, lineColumnAt, normalizeKey, phrasePattern } from './text-utils.js';

export function compileGlossary(terms, { caseSensitive = false } = {}) {
  const issues = [];
  const seen = new Map();
  const rules = [];

  for (const [rowIndex, term] of terms.entries()) {
    const canonical = String(term.canonical || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!canonical) continue;
    const variants = String(term.variants || '').split(',').map((v) => v.normalize('NFKC').trim().replace(/\s+/g, ' ')).filter(Boolean);
    for (const variant of variants) {
      if (normalizeKey(variant, caseSensitive) === normalizeKey(canonical, caseSensitive)) {
        issues.push(`Baris ${rowIndex + 1}: varian “${variant}” sama dengan istilah baku.`);
        continue;
      }
      const key = normalizeKey(variant, caseSensitive);
      if (seen.has(key) && normalizeKey(seen.get(key), caseSensitive) !== normalizeKey(canonical, caseSensitive)) {
        issues.push(`Varian “${variant}” diarahkan ke dua istilah baku: “${seen.get(key)}” dan “${canonical}”.`);
        continue;
      }
      if (seen.has(key)) continue;
      seen.set(key, canonical);
      const source = `(?<![\\p{L}\\p{N}_])(${phrasePattern(variant)})(?![\\p{L}\\p{N}_])`;
      rules.push({ canonical, variant, regex: new RegExp(source, caseSensitive ? 'gu' : 'giu') });
    }
  }
  rules.sort((a, b) => b.variant.length - a.variant.length);
  return { rules, issues };
}

export function findGlossaryMatches(text, rules) {
  const candidates = [];
  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    let match;
    while ((match = rule.regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const location = lineColumnAt(text, start);
      candidates.push({ ...rule, start, end, matched: match[0], ...location, context: contextAround(text, start, end) });
      if (rule.regex.lastIndex === match.index) rule.regex.lastIndex += 1;
    }
  }
  candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const accepted = [];
  let lastEnd = -1;
  for (const item of candidates) {
    if (item.start >= lastEnd) {
      accepted.push(item);
      lastEnd = item.end;
    }
  }
  return accepted;
}

export function replaceGlossaryMatches(text, matches, { preserveCase = true } = {}) {
  let output = '';
  let cursor = 0;
  for (const match of matches) {
    output += text.slice(cursor, match.start);
    output += preserveCase ? applyCasePattern(match.canonical, match.matched) : match.canonical;
    cursor = match.end;
  }
  return output + text.slice(cursor);
}

export function groupGlossaryMatches(matches) {
  const groups = new Map();
  for (const match of matches) {
    const key = `${match.canonical}\u0000${match.variant}`;
    if (!groups.has(key)) groups.set(key, { canonical: match.canonical, variant: match.variant, count: 0, locations: [], contexts: [] });
    const group = groups.get(key);
    group.count += 1;
    group.locations.push(`baris ${match.line}:${match.column}`);
    if (group.contexts.length < 3) group.contexts.push(match.context);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.variant.localeCompare(b.variant, 'id'));
}
