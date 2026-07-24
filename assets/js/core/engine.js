// core/engine.js
// Orchestrates every deterministic (non-AI) check into one analyze() call.
// Pure ES module, no DOM access — this is what tests/*.test.js import
// directly, so the exact code path shipped to the browser is under test.

import { tokenize, escapeRegExp } from './tokenizer.js';
import { levenshtein, commonPrefixLen, commonSuffixLen } from './levenshtein.js';
import { identifierStyle, identifierRoot } from './identifier.js';
import { spellingKey, stripEnglishAffixes } from './spelling.js';
import { isBoundaryStart, computeExcludedRanges, inRanges, findReferencesSectionStart } from './boundaries.js';
import { BUILTIN_GLOSSARY, matchGlossary } from './glossary.js';
import { detectAcronymIssues } from './acronym.js';
import { detectPhraseIssues } from './phrases.js';

const STOPWORDS = new Set(['through', 'throughout', 'although', 'because', 'without', 'within',
  'between', 'before', 'unless', 'during', 'should', 'would', 'could', 'their', 'there', 'these',
  'those', 'where', 'while', 'which', 'whose', 'being', 'having', 'around', 'across', 'toward',
  'towards', 'beyond', 'behind', 'beneath', 'regarding', 'concerning', 'despite', 'whereas',
  'whenever', 'wherever', 'whatever', 'however', 'moreover', 'therefore', 'further', 'furthermore',
  'nevertheless', 'nonetheless', 'itself', 'himself', 'herself', 'themselves', 'ourselves']);

export function analyze(text, opts = {}) {
  const tokens = tokenize(text);
  const findings = { case: [], hyphenation: [], identifier: [], spelling: [], glossary: [], acronym: [], phrase: [], reorder: [], fuzzy: [] };

  const refStart = findReferencesSectionStart(text);
  const isInBody = (pos) => refStart < 0 || pos < refStart;
  const excludedRanges = computeExcludedRanges(text);
  const isUsable = (pos) => isInBody(pos) && !inRanges(excludedRanges, pos);

  const byLower = new Map();
  for (const t of tokens) {
    const key = t.text.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, []);
    byLower.get(key).push(t);
  }

  // 1) CASE variants — only flagged when the discrepancy shows up mid-sentence,
  // inside the author's own prose (not a heading, table, or reference entry).
  if (opts.checkCase !== false) {
    for (const [key, occ] of byLower) {
      if (key.length < 3 || !/[a-z]/i.test(key)) continue;
      if (/[0-9_-]/.test(key)) continue;
      const nonHeadingOcc = occ.filter(o => isUsable(o.start));
      if (nonHeadingOcc.length < 2) continue;
      const interior = nonHeadingOcc.filter(o => !isBoundaryStart(text, o.start));
      const interiorForms = new Set(interior.map(o => o.text));
      if (interiorForms.size > 1) {
        const forms = new Map();
        for (const o of nonHeadingOcc) forms.set(o.text, (forms.get(o.text) || 0) + 1);
        findings.case.push({ key, variants: [...forms.entries()].map(([f, c]) => ({ form: f, count: c })), occurrences: nonHeadingOcc });
      }
    }
  }

  // 2) HYPHENATION variants: e-mail / email
  if (opts.checkHyphenation !== false) {
    const byStripped = new Map();
    for (const [key, occ] of byLower) {
      const stripped = key.replace(/[-_]/g, '');
      if (!byStripped.has(stripped)) byStripped.set(stripped, new Map());
      byStripped.get(stripped).set(key, (byStripped.get(stripped).get(key) || 0) + occ.length);
    }
    for (const [stripped, forms] of byStripped) {
      if (stripped.length < 4) continue;
      if (forms.size > 1) {
        const structures = new Set([...forms.keys()].map(f => f.includes('_') ? 'snake' : f.includes('-') ? 'kebab' : 'plain'));
        if (structures.size > 1) {
          const occ = [];
          for (const f of forms.keys()) occ.push(...(byLower.get(f) || []));
          findings.hyphenation.push({ key: stripped, variants: [...forms.entries()].map(([f, c]) => ({ form: f, count: c })), occurrences: occ });
        }
      }
    }
  }

  // 3) IDENTIFIER naming style: userId / user_id / UserID
  if (opts.checkIdentifier !== false) {
    const byRoot = new Map();
    for (const t of tokens) {
      const style = identifierStyle(t.text);
      if (!style) continue;
      const root = identifierRoot(t.text);
      if (root.length < 4) continue;
      if (!byRoot.has(root)) byRoot.set(root, new Map());
      const m = byRoot.get(root);
      const entryKey = t.text + '|' + style;
      if (!m.has(entryKey)) m.set(entryKey, { form: t.text, style, count: 0, occ: [] });
      const entry = m.get(entryKey);
      entry.count++;
      entry.occ.push(t);
    }
    for (const [root, m] of byRoot) {
      const styles = new Set([...m.values()].map(v => v.style));
      if (styles.size > 1) {
        const occ = [];
        for (const v of m.values()) occ.push(...v.occ);
        findings.identifier.push({
          key: root,
          variants: [...m.values()].map(v => ({ form: v.form + '  (' + v.style + ')', count: v.count })),
          occurrences: occ
        });
      }
    }
  }

  // 4) SPELLING system: American vs British forms mixed in the same document
  if (opts.checkSpelling !== false) {
    const bySpellKey = new Map();
    for (const [key, occ] of byLower) {
      if (key.length < 4 || !/^[a-z]+$/.test(key)) continue;
      const sk = spellingKey(key);
      if (!bySpellKey.has(sk)) bySpellKey.set(sk, new Map());
      bySpellKey.get(sk).set(key, occ.length);
    }
    for (const [sk, forms] of bySpellKey) {
      if (forms.size > 1) {
        const rawForms = [...forms.keys()];
        if (rawForms.some(f => f !== rawForms[0])) {
          const occ = [];
          for (const f of rawForms) occ.push(...(byLower.get(f) || []));
          findings.spelling.push({ key: sk, variants: [...forms.entries()].map(([f, c]) => ({ form: f, count: c })), occurrences: occ });
        }
      }
    }
  }

  // 5) GLOSSARY: user + built-in synonym pairs
  const glossaryLines = opts.glossaryLines || [];
  if (glossaryLines.length) {
    findings.glossary = matchGlossary(text, glossaryLines, escapeRegExp);
  }

  // 6) ACRONYM consistency
  if (opts.checkAcronym !== false) {
    findings.acronym = detectAcronymIssues(text, tokens, { checkUndefined: !!opts.checkUndefinedAcronyms });
  }

  // 7) PHRASE (two-word term) consistency — casing/hyphenation of the whole
  // term, and word-order swaps ("audit committee" vs "committee audit").
  // Neither requires a glossary: both are detected purely from adjacency.
  if (opts.checkPhrase !== false) {
    const phraseResults = detectPhraseIssues(text, tokens, isUsable);
    findings.phrase = phraseResults.casing;
    findings.reorder = phraseResults.reordering;
  }

  // 8) FUZZY near-duplicate spelling (typo candidates)
  if (opts.checkFuzzy !== false) {
    const bodyByLower = new Map();
    for (const [k, occ] of byLower) {
      const filtered = occ.filter(o => isUsable(o.start));
      if (filtered.length) bodyByLower.set(k, filtered);
    }
    const uniqueWords = [...bodyByLower.keys()].filter(w => w.length >= 6 && /^[a-z]+$/.test(w) && !STOPWORDS.has(w));
    const byBucket = new Map();
    for (const w of uniqueWords) {
      const bucket = w.slice(0, 2);
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket).push(w);
    }
    const sensitivity = opts.sensitivity == null ? 1 : opts.sensitivity;
    const threshold = sensitivity === 0 ? 1 : sensitivity === 1 ? 2 : 3;
    const minCountCap = sensitivity === 0 ? 2 : sensitivity === 1 ? 3 : 6;
    const seenPairs = new Set();
    for (const [, bucket] of byBucket) {
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i], b = bucket[j];
          if (Math.abs(a.length - b.length) > threshold) continue;
          const dist = levenshtein(a, b);
          const maxAllowed = a.length > 8 ? threshold + 1 : threshold;
          if (dist === 0 || dist > maxAllowed) continue;
          if (stripEnglishAffixes(a) === stripEnglishAffixes(b)) continue;
          if (spellingKey(a) === spellingKey(b)) continue;
          const occA = bodyByLower.get(a), occB = bodyByLower.get(b);
          if (Math.min(occA.length, occB.length) > minCountCap) continue;
          const pfx = commonPrefixLen(a, b), sfx = commonSuffixLen(a, b);
          const sharedEnough = (pfx >= 2 && sfx >= 1) || (pfx >= 1 && sfx >= 2);
          if (!sharedEnough) continue;
          const pairKey = [a, b].sort().join('~');
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);
          findings.fuzzy.push({
            key: pairKey,
            variants: [{ form: a, count: occA.length }, { form: b, count: occB.length }],
            occurrences: [...occA, ...occB]
          });
        }
      }
    }
  }

  return findings;
}

export { tokenize, levenshtein, identifierStyle, identifierRoot, spellingKey, stripEnglishAffixes,
  commonPrefixLen, commonSuffixLen, escapeRegExp, BUILTIN_GLOSSARY };
export { escapeHtml, contextSnippet } from './tokenizer.js';
export { extractFrequentBigrams } from './phrases.js';
export { computeExcludedRanges, inRanges, findReferencesSectionStart } from './boundaries.js';
