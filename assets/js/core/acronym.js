// core/acronym.js
// Academic-writing specific: catches an acronym defined two different ways
// in the same manuscript, and (optionally) acronyms used repeatedly that
// are never introduced via a "Full Term (ACR)" pattern.

const DEF_RE = /((?:[A-Z][a-zA-Z]+\s+){1,6})\(([A-Z]{2,8})\)/g;
const COMMON_KNOWN = new Set(['US', 'UK', 'USA', 'UN', 'EU']);

export function detectAcronymIssues(text, tokens, opts = {}) {
  const results = [];
  const defs = new Map();
  let dm;
  const re = new RegExp(DEF_RE);
  while ((dm = re.exec(text)) !== null) {
    const full = dm[1].trim();
    const acr = dm[2];
    const start = dm.index;
    const end = dm.index + dm[0].length;
    if (!defs.has(acr)) defs.set(acr, []);
    defs.get(acr).push({ full, start, end });
  }

  for (const [acr, list] of defs) {
    const uniqueFulls = new Map();
    for (const d of list) {
      const k = d.full.toLowerCase();
      if (!uniqueFulls.has(k)) uniqueFulls.set(k, d.full);
    }
    if (uniqueFulls.size > 1) {
      results.push({
        key: acr,
        variants: [...uniqueFulls.values()].map(f => ({ form: f + '  \u2192  ' + acr, count: 0 })),
        occurrences: list.map(d => ({ text: acr, start: d.start, end: d.end }))
      });
    }
  }

  if (opts.checkUndefined) {
    const capCounts = new Map();
    for (const t of tokens) {
      if (/^[A-Z]{2,8}$/.test(t.text)) {
        if (!capCounts.has(t.text)) capCounts.set(t.text, []);
        capCounts.get(t.text).push(t);
      }
    }
    for (const [acr, occ] of capCounts) {
      if (occ.length >= 3 && !defs.has(acr) && !COMMON_KNOWN.has(acr)) {
        results.push({
          key: acr + '-undefined',
          variants: [{ form: acr + '  (used ' + occ.length + '\u00D7, no "(...)" definition found)', count: 0 }],
          occurrences: occ,
          undefined: true
        });
      }
    }
  }

  return results;
}
