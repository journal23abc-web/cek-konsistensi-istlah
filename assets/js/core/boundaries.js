// core/boundaries.js
// Structural-awareness helpers so the case/fuzzy checks only look at the
// author's own running prose — not headings, table cells, or the reference
// list, all of which capitalize/repeat words for reasons that have nothing
// to do with terminology consistency.

// Is the character at tokenStart the first "real" content after a sentence
// boundary (. ! ? :), skipping whitespace and purely decorative wrapper
// characters (markdown emphasis, quotes, brackets, table/formula noise)?
// A run of two or more newlines (a blank-line paragraph/section break) is
// also treated as a boundary regardless of what precedes it.
export function isBoundaryStart(text, tokenStart) {
  let i = tokenStart - 1;
  let newlineRun = 0;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '\n') { newlineRun++; i--; continue; }
    if (/\s/.test(ch)) { i--; continue; }
    if (newlineRun >= 2) return true;
    newlineRun = 0;
    if (/[*_#>"'\u201c\u201d\u2018\u2019()[\]+=~|-]/.test(ch)) { i--; continue; }
    if ('.!?:'.includes(ch)) return true;
    return false;
  }
  return true;
}

const HEADING_WORDS = /^\s*(?:\d+\.?\d*\.?\s*)?(abstract|introduction|literature review|related work|methods?|methodology|materials? and methods?|results?(\s+and\s+discussion)?|discussion|conclusions?|recommendations?|references|bibliography|acknowledge?ments?|appendix(es)?|keywords?)\s*[:.]?\s*$/i;

// Section headings, ALL-CAPS labels, whole-line **bold** sub-headings,
// table/figure captions, and markdown table rows are excluded — they are
// document structure, not prose.
export function computeExcludedRanges(text) {
  const ranges = [];
  const lines = text.split('\n');
  let idx = 0;
  for (const line of lines) {
    const start = idx;
    const end = idx + line.length;
    idx = end + 1;
    if ((line.match(/\|/g) || []).length >= 2) { ranges.push([start, end]); continue; }
    const core = line.replace(/[*_#>]/g, '').trim();
    if (!core || core.length > 100) continue;
    const letters = core.replace(/[^A-Za-z]/g, '');
    let heading = false;
    if (/^\*\*.+\*\*$/.test(line.trim())) heading = true;
    if (letters.length >= 3 && letters === letters.toUpperCase() && /[A-Z]/.test(letters)) heading = true;
    if (HEADING_WORDS.test(core)) heading = true;
    if (/^(table|figure|fig\.)\s*\d+/i.test(core)) heading = true;
    if (heading) ranges.push([start, end]);
  }
  return ranges;
}

export function inRanges(ranges, pos) {
  for (const [s, e] of ranges) {
    if (s > pos) break;
    if (pos >= s && pos < e) return true;
  }
  return false;
}

// Reference-list entries title-case journal/article names as a citation
// convention, not as a terminology choice. Returns the character offset
// where the References/Bibliography section starts, or -1 if none found.
export function findReferencesSectionStart(text) {
  const lines = text.split('\n');
  let idx = 0;
  const re = /^(references|bibliography|works cited|list of references)$/i;
  for (const line of lines) {
    const core = line.replace(/[*_#>]/g, '').trim();
    if (re.test(core)) return idx;
    idx += line.length + 1;
  }
  return -1;
}
