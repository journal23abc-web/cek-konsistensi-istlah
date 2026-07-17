const KEYWORDS = new Set(`const let var function return if else for while do switch case break continue class extends new this typeof instanceof import export default from async await true false null undefined void delete in of try catch finally throw yield static get set super constructor interface type enum namespace implements public private protected readonly abstract as is never unknown any string number boolean object symbol bigint def elif self none pass lambda global nonlocal with raise except assert del not and or`.split(/\s+/));

export function stripCommentsAndStrings(code) {
  const out = [...code];
  let i = 0;
  let state = 'code';
  while (i < code.length) {
    const ch = code[i], next = code[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') { out[i] = out[i + 1] = ' '; i += 2; state = 'line'; continue; }
      if (ch === '/' && next === '*') { out[i] = out[i + 1] = ' '; i += 2; state = 'block'; continue; }
      if (ch === "'") { out[i] = ' '; i += 1; state = 'single'; continue; }
      if (ch === '"') { out[i] = ' '; i += 1; state = 'double'; continue; }
      if (ch === '`') { out[i] = ' '; i += 1; state = 'template'; continue; }
      i += 1; continue;
    }
    if (state === 'line') { if (ch === '\n') state = 'code'; else out[i] = ' '; i += 1; continue; }
    if (state === 'block') { if (ch === '*' && next === '/') { out[i] = out[i + 1] = ' '; i += 2; state = 'code'; } else { if (ch !== '\n') out[i] = ' '; i += 1; } continue; }
    if (ch === '\\') { out[i] = ' '; if (i + 1 < out.length && code[i + 1] !== '\n') out[i + 1] = ' '; i += 2; continue; }
    const closing = state === 'single' ? "'" : state === 'double' ? '"' : '`';
    if (ch === closing) { out[i] = ' '; i += 1; state = 'code'; continue; }
    if (ch !== '\n') out[i] = ' ';
    i += 1;
  }
  return out.join('');
}

export function splitIdentifier(name) {
  return name.replace(/^[$_]+/, '').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Za-z])([0-9])/g, '$1 $2').replace(/([0-9])([A-Za-z])/g, '$1 $2').split(/[_$\s]+/).filter(Boolean).map((part) => part.toLocaleLowerCase('en-US'));
}

export function identifierStyle(name) {
  const clean = name.replace(/^[$]+/, '');
  if (/^[A-Z][A-Z0-9_]*$/.test(clean) && clean.includes('_')) return 'screaming_snake';
  if (clean.includes('_')) return 'snake';
  if (/^[A-Z]/.test(clean)) return 'pascal';
  if (/[A-Z]/.test(clean)) return 'camel';
  return 'flat';
}

function formatIdentifier(words, style) {
  if (!words.length) return '';
  if (style === 'snake') return words.join('_');
  if (style === 'screaming_snake') return words.join('_').toUpperCase();
  if (style === 'pascal') return words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  if (style === 'camel') return words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return words.join('');
}

export function analyzeIdentifiers(code) {
  const clean = stripCommentsAndStrings(code);
  const regex = /[$_\p{L}][$_\p{L}\p{N}]*/gu;
  const groups = new Map();
  const styleCounts = new Map();
  let match;
  while ((match = regex.exec(clean)) !== null) {
    const token = match[0];
    const lower = token.toLocaleLowerCase('en-US');
    if (KEYWORDS.has(lower) || token.length < 3) continue;
    const words = splitIdentifier(token);
    if (!words.length) continue;
    const key = words.join('');
    if (key.length < 3) continue;
    const style = identifierStyle(token);
    styleCounts.set(style, (styleCounts.get(style) || 0) + 1);
    if (!groups.has(key)) groups.set(key, { key, words, variants: new Map() });
    const group = groups.get(key);
    const item = group.variants.get(token) || { name: token, count: 0, style, positions: [] };
    item.count += 1;
    item.positions.push(match.index);
    group.variants.set(token, item);
  }
  const dominantStyle = [...styleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'camel';
  const inconsistent = [...groups.values()].filter((group) => group.variants.size > 1).map((group) => {
    const variants = [...group.variants.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const aligned = variants.filter((v) => v.style === dominantStyle);
    const suggested = aligned[0]?.name || formatIdentifier(group.words, dominantStyle) || variants[0].name;
    return { ...group, variants, suggested, dominantStyle };
  }).sort((a, b) => b.variants.length - a.variants.length);
  return { inconsistent, dominantStyle, totalIdentifiers: [...groups.values()].reduce((sum, g) => sum + [...g.variants.values()].reduce((s, v) => s + v.count, 0), 0) };
}
