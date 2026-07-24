// core/glossary.js
// Deterministic, hand-maintained synonym pairs — NOT a semantic model.
// This is the mechanism that lets the tool catch "different word, same
// meaning" cases without guessing: it only works for pairs listed here or
// added by the user. See ai/semantic.js for the (separate, probabilistic)
// embedding-based layer that attempts to go beyond a fixed list.

export const BUILTIN_GLOSSARY = `dataset, data set
website, web site
email, e-mail
online, on-line
login, log in
logout, log out
setup, set up
follow-up, follow up, followup
real-time, real time
healthcare, health care
peer review, peer-review
case study, case-study
long-term, long term
short-term, short term
well-known, well known
state-of-the-art, state of the art
open-source, open source
cross-sectional, cross sectional
p-value, p value
sample size, sample-size
subgroup, sub-group
preprocessing, pre-processing
postprocessing, post-processing
overfitting, over-fitting
underfitting, under-fitting
nonlinear, non-linear
multidisciplinary, multi-disciplinary
baseline, base line
worldwide, world-wide
lifecycle, life cycle
coworker, co-worker`;

export function matchGlossary(text, glossaryLines, escapeRegExp) {
  const results = [];
  for (const line of glossaryLines) {
    const parts = line.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const preferred = parts[0];
    const alts = parts.slice(1);
    for (const alt of alts) {
      const re = new RegExp('\\b' + escapeRegExp(alt) + '\\b', 'gi');
      let m;
      const occ = [];
      while ((m = re.exec(text)) !== null) occ.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      if (occ.length) {
        results.push({
          key: alt.toLowerCase(),
          variants: [{ form: preferred + '  (preferred)', count: 0 }, { form: alt, count: occ.length }],
          occurrences: occ
        });
      }
    }
  }
  return results;
}
