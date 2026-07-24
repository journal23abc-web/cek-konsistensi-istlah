// assets/js/app.js
import { analyze, tokenize, escapeHtml, escapeRegExp, contextSnippet, BUILTIN_GLOSSARY } from './core/engine.js';
import { buildMarkdownReport, buildPrintableReportHTML, downloadMarkdown } from './core/report.js';
import { extractCandidateTerms, SemanticAnalyzer } from './ai/semantic.js';

const $ = (sel) => document.querySelector(sel);

const textEl = $('#input-text');
const wordCountEl = $('#wordcount');
const sensEl = $('#sensitivity');
const sensVal = $('#sens-val');
const statusLine = $('#status-line');
const resultsSection = $('#results-section');
const resultsBody = $('#results-body');
const annotBody = $('#annot-body');
const aiStatus = $('#ai-status');
const btnAi = $('#btn-ai');

const SENS_LABELS = ['loose', 'balanced', 'strict'];
sensEl.addEventListener('input', () => { sensVal.textContent = SENS_LABELS[sensEl.value]; });

textEl.addEventListener('input', updateWordCount);
function updateWordCount() {
  const words = (textEl.value.match(/[\p{L}\p{N}_-]+/gu) || []).length;
  wordCountEl.textContent = words + (words === 1 ? ' word' : ' words');
}

$('#file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => { textEl.value = ev.target.result; updateWordCount(); };
  reader.readAsText(file);
});

$('#btn-clear').addEventListener('click', () => {
  textEl.value = '';
  updateWordCount();
  resultsSection.style.display = 'none';
  lastFindings = null;
  lastText = '';
  btnAi.disabled = true;
});

const SAMPLE_TEXT = `Every registered User must verify their Email before signing in. After that, the user receives an e-mail confirmation from the server.

In the configuration section, the developer sets userId according to the agreed format. In another module, however, the team uses user_id, and the API reference lists it as UserID.

We organize the dataset before analysis. Later sections organise the same data using a different pipeline, and the web site documentation still refers to it as a "data set".

We use Natural Language Processing (NLP) throughout this study. In the related-work section, an unrelated Neural Language Pipeline (NLP) is also mentioned, which may confuse readers. The GAN model is referenced repeatedly but never expanded on first use.

The corpus was cleaned before training. The dataset was then split into folds. Analysts reviewed the corpus for label noise before every run.`;

$('#btn-sample').addEventListener('click', () => {
  textEl.value = SAMPLE_TEXT;
  updateWordCount();
});

const CAT_META = {
  case:        { label: 'Casing variants', sym: 'Aa', cls: 'c-red', mcls: 'm-red', color: 'var(--red)' },
  hyphenation: { label: 'Hyphenation / spacing variants', sym: '\u2013_', cls: 'c-amber', mcls: 'm-amber', color: 'var(--amber)' },
  identifier:  { label: 'Variable naming consistency', sym: '{ }', cls: 'c-violet', mcls: 'm-violet', color: 'var(--violet)' },
  spelling:    { label: 'American / British spelling mixed', sym: 'AmE/BrE', cls: 'c-amber', mcls: 'm-amber', color: 'var(--amber)' },
  glossary:    { label: 'Glossary \u2014 preferred terminology', sym: '\u2248', cls: 'c-green', mcls: 'm-green', color: 'var(--green)' },
  acronym:     { label: 'Acronym consistency', sym: 'ABC', cls: 'c-violet', mcls: 'm-violet', color: 'var(--violet)' },
  phrase:      { label: 'Two-word term casing consistency', sym: '\u201c \u201d', cls: 'c-red', mcls: 'm-red', color: 'var(--red)' },
  reorder:     { label: 'Two-word term order consistency', sym: '\u21C6', cls: 'c-amber', mcls: 'm-amber', color: 'var(--amber)' },
  fuzzy:       { label: 'Possible spelling variant (typo candidate)', sym: '~', cls: 'c-red', mcls: 'm-red', color: 'var(--red)' },
  semantic:    { label: 'AI-suggested synonyms (unverified)', sym: 'AI', cls: 'c-cyan', mcls: 'm-cyan', color: 'var(--cyan)' }
};
const CAT_ORDER = ['case', 'hyphenation', 'identifier', 'spelling', 'glossary', 'acronym', 'phrase', 'reorder', 'fuzzy', 'semantic'];

let lastFindings = null;
let lastText = '';
let semanticFindings = [];

function collectFlaggedForms(findings) {
  const set = new Set();
  for (const cat of Object.keys(findings)) {
    for (const item of findings[cat]) {
      for (const v of item.variants) {
        const raw = v.form.split('  (')[0].split('  \u2192')[0].toLowerCase();
        if (raw) set.add(raw);
      }
    }
  }
  return set;
}

function renderResults(text, findings, semanticItems) {
  resultsBody.innerHTML = '';
  let total = 0, groups = 0;
  const highlightMap = new Map();

  const allCats = CAT_ORDER.filter(c => c !== 'semantic' || (semanticItems && semanticItems.length));
  const combined = { ...findings, semantic: semanticItems || [] };

  for (const cat of allCats) {
    const items = combined[cat];
    if (!items || !items.length) continue;
    const meta = CAT_META[cat];
    groups += items.length;

    const block = document.createElement('div');
    block.className = 'cat-block';
    block.dataset.category = cat;

    const titleEl = document.createElement('div');
    titleEl.className = 'cat-title';
    titleEl.style.color = meta.color;
    titleEl.innerHTML = '<span class="cat-sym">' + meta.sym + '</span> ' + meta.label + ' <span class="cat-count">' + items.length + (items.length === 1 ? ' group' : ' groups') + '</span>';
    block.appendChild(titleEl);

    if (cat === 'fuzzy') {
      const note = document.createElement('div');
      note.className = 'cat-note';
      note.textContent = 'Candidates only \u2014 edit-distance similarity does not know which spelling is "correct". Verify each pair manually.';
      block.appendChild(note);
    }
    if (cat === 'acronym') {
      const note = document.createElement('div');
      note.className = 'cat-note';
      note.textContent = 'Detects acronyms defined two different ways, and (optionally) acronyms used repeatedly without a "Full Term (ACR)" definition.';
      block.appendChild(note);
    }
    if (cat === 'semantic') {
      const note = document.createElement('div');
      note.className = 'cat-note';
      note.textContent = 'Produced by a local embedding model comparing meaning, not spelling \u2014 these are candidates for you to judge, not confirmed errors. Nothing here has been verified against a dictionary.';
      block.appendChild(note);
    }

    for (const item of items) {
      const occCount = item.occurrences ? item.occurrences.length : 0;
      total += occCount;
      for (const v of item.variants) {
        const rawForm = v.form.split('  (')[0].split('  \u2192')[0].toLowerCase();
        if (rawForm) highlightMap.set(rawForm, meta.mcls);
      }

      const card = document.createElement('div');
      card.className = 'note-card ' + meta.cls;

      const top = document.createElement('div');
      top.className = 'note-top';
      item.variants.forEach((v, idx) => {
        if (idx > 0) {
          const arrow = document.createElement('span');
          arrow.className = 'arrow';
          arrow.textContent = '\u21C4';
          top.appendChild(arrow);
        }
        const chip = document.createElement('span');
        chip.className = 'variant-chip';
        chip.innerHTML = escapeHtml(v.form) + (v.count ? '<span class="n">\u00D7' + v.count + '</span>' : '');
        top.appendChild(chip);
      });
      if (item.similarity != null) {
        const simChip = document.createElement('span');
        simChip.className = 'sim-chip';
        simChip.textContent = Math.round(item.similarity * 100) + '% similar';
        top.appendChild(simChip);
      }
      card.appendChild(top);

      if (item.occurrences && item.occurrences.length) {
        const ctxWrap = document.createElement('div');
        ctxWrap.className = 'contexts';
        const occSample = item.occurrences.slice(0, 3);
        for (const o of occSample) {
          const line = document.createElement('div');
          line.className = 'ctx-line';
          const snippet = contextSnippet(text, o.start, o.end);
          const escaped = escapeHtml(snippet);
          const re = new RegExp('(' + escapeRegExp(escapeHtml(o.text)) + ')', 'i');
          line.innerHTML = escaped.replace(re, '<mark>$1</mark>');
          ctxWrap.appendChild(line);
        }
        if (item.occurrences.length > 3) {
          const more = document.createElement('div');
          more.className = 'ctx-more';
          more.textContent = '+ ' + (item.occurrences.length - 3) + ' more occurrence(s)';
          ctxWrap.appendChild(more);
        }
        card.appendChild(ctxWrap);
      }
      block.appendChild(card);
    }
    resultsBody.appendChild(block);
  }

  $('#score-total').textContent = total;
  $('#score-groups').textContent = groups;

  renderAnnotated(text, highlightMap);

  if (groups === 0) {
    resultsBody.innerHTML = '<div class="empty-state">No inconsistencies found in the selected categories. The manuscript looks clean by these checks.</div>';
  }
  resultsSection.style.display = 'block';
}

function renderAnnotated(text, highlightMap) {
  if (highlightMap.size === 0) {
    annotBody.textContent = text.slice(0, 6000);
    return;
  }
  const forms = [...highlightMap.keys()].sort((a, b) => b.length - a.length);
  const pattern = forms.map(escapeRegExp).join('|');
  const re = new RegExp('\\b(' + pattern + ')\\b', 'gi');
  const limited = text.length > 8000 ? text.slice(0, 8000) : text;
  let html = '';
  let last = 0;
  let m;
  while ((m = re.exec(limited)) !== null) {
    html += escapeHtml(limited.slice(last, m.index));
    const cls = highlightMap.get(m[0].toLowerCase()) || 'm-red';
    html += '<mark class="' + cls + '">' + escapeHtml(m[0]) + '</mark>';
    last = m.index + m[0].length;
  }
  html += escapeHtml(limited.slice(last));
  if (text.length > 8000) html += '\n\n\u2026 (truncated \u2014 manuscript too long to display in full)';
  annotBody.innerHTML = html;
}

$('#btn-run').addEventListener('click', () => {
  const text = textEl.value.trim();
  if (!text) { statusLine.textContent = 'Paste or upload a manuscript first.'; return; }
  statusLine.textContent = 'Checking\u2026';
  setTimeout(() => {
    let glossaryLines = $('#glossary').value.split('\n').map(s => s.trim()).filter(Boolean);
    if ($('#chk-builtin-gloss').checked) {
      glossaryLines = BUILTIN_GLOSSARY.split('\n').map(s => s.trim()).filter(Boolean).concat(glossaryLines);
    }
    const opts = {
      checkCase: $('#chk-case').checked,
      checkHyphenation: $('#chk-hyphenation').checked,
      checkIdentifier: $('#chk-identifier').checked,
      checkSpelling: $('#chk-spelling').checked,
      checkAcronym: $('#chk-acronym').checked,
      checkUndefinedAcronyms: $('#chk-acronym-undefined').checked,
      checkPhrase: $('#chk-phrase').checked,
      checkFuzzy: $('#chk-fuzzy').checked,
      sensitivity: parseInt(sensEl.value, 10),
      glossaryLines
    };
    const findings = analyze(text, opts);
    lastFindings = findings;
    lastText = text;
    semanticFindings = [];
    renderResults(text, findings, []);
    const totalGroups = Object.values(findings).reduce((s, a) => s + a.length, 0);
    statusLine.textContent = 'Done \u2014 ' + totalGroups + (totalGroups === 1 ? ' group' : ' groups') + ' found.';
    btnAi.disabled = false;
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 20);
});

// ---------- optional AI-assisted semantic search ----------
let semanticAnalyzer = null;

btnAi.addEventListener('click', async () => {
  if (!lastFindings || !lastText) {
    aiStatus.textContent = 'Run the deterministic check first.';
    return;
  }
  btnAi.disabled = true;
  aiStatus.textContent = 'Preparing candidate terms\u2026';
  try {
    const tokens = tokenize(lastText);
    const excludeForms = collectFlaggedForms(lastFindings);
    const candidates = extractCandidateTerms(lastText, tokens, excludeForms);
    if (candidates.length < 2) {
      aiStatus.textContent = 'Not enough distinct recurring terms to compare.';
      btnAi.disabled = false;
      return;
    }
    if (!semanticAnalyzer) {
      const workerUrl = new URL('./workers/embedding-worker.js', import.meta.url);
      semanticAnalyzer = new SemanticAnalyzer(workerUrl);
    }
    const threshold = parseFloat($('#ai-threshold').value);
    const pairs = await semanticAnalyzer.analyze(candidates, {
      threshold,
      onStatus: (phase) => {
        const messages = {
          'loading-model': 'Loading embedding model from CDN (first run only, ~30\u201390 MB)\u2026',
          embedding: 'Computing embeddings for ' + candidates.length + ' candidate terms\u2026',
          comparing: 'Comparing meaning across all candidate pairs\u2026'
        };
        aiStatus.textContent = messages[phase] || phase;
      }
    });

    semanticFindings = pairs.map(p => {
      const occA = findOccurrences(lastText, tokens, p.a);
      const occB = findOccurrences(lastText, tokens, p.b);
      return {
        key: [p.a, p.b].sort().join('~'),
        variants: [{ form: p.a, count: occA.length }, { form: p.b, count: occB.length }],
        occurrences: [...occA, ...occB],
        similarity: p.similarity
      };
    });

    aiStatus.textContent = pairs.length
      ? 'Found ' + pairs.length + ' candidate synonym pair(s).'
      : 'No candidate pairs above the similarity threshold.';
    renderResults(lastText, lastFindings, semanticFindings);
  } catch (err) {
    aiStatus.textContent = 'AI search failed: ' + err.message + ' (the rest of the report above is unaffected.)';
  } finally {
    btnAi.disabled = false;
  }
});

function findOccurrences(text, tokens, term) {
  if (term.includes(' ')) {
    const re = new RegExp('\\b' + escapeRegExp(term) + '\\b', 'gi');
    const occ = [];
    let m;
    while ((m = re.exec(text)) !== null) occ.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    return occ;
  }
  return tokens.filter(t => t.text.toLowerCase() === term.toLowerCase());
}

function getSelectedExportCategories() {
  return [...document.querySelectorAll('#export-options input:checked')].map(c => c.value);
}

function buildCategoryBlocks(selectedCats) {
  const blocks = [];
  document.querySelectorAll('.cat-block').forEach((block) => {
    const catKey = block.dataset.category;
    if (selectedCats.length && !selectedCats.includes(catKey)) return;
    const title = block.querySelector('.cat-title').textContent.trim();
    const items = [...block.querySelectorAll('.note-card')].map(card => {
      const chips = [...card.querySelectorAll('.variant-chip')].map(c => c.textContent.trim());
      const contexts = [...card.querySelectorAll('.ctx-line')].map(c => c.textContent.trim());
      return { variantSummary: chips.join(' \u21C4 '), contexts, occurrenceCount: contexts.length || 1 };
    });
    blocks.push({ key: catKey, title, items });
  });
  return blocks;
}

$('#btn-export-md').addEventListener('click', () => {
  const blocks = buildCategoryBlocks(getSelectedExportCategories());
  downloadMarkdown('consistency-report.md', buildMarkdownReport(blocks));
});

$('#btn-export-pdf').addEventListener('click', () => {
  const blocks = buildCategoryBlocks(getSelectedExportCategories());
  const wordCount = (lastText.match(/[\p{L}\p{N}_-]+/gu) || []).length;
  const html = buildPrintableReportHTML(blocks, { wordCount });
  $('#report-page').innerHTML = html;
  $('#preview-shell').style.display = 'block';
  $('#preview-shell').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#btn-print').addEventListener('click', () => {
  window.print();
});
