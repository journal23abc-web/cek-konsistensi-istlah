// core/spelling.js
// American/British spelling-pattern normalization, and a lightweight English
// affix stripper used to keep the fuzzy matcher from flagging ordinary
// inflection (e.g. "cite" vs "cited") as a spelling variant.

export function spellingKey(word) {
  let w = word.toLowerCase();
  if (w.length < 4) return w;
  w = w.replace(/our$/, 'or');
  w = w.replace(/is(e|ed|es|ing|er|ers|ation|ations|able)$/, 'iz$1');
  w = w.replace(/([bcdfgklmnprstvz])re$/, '$1er');
  w = w.replace(/ae/g, 'e');
  w = w.replace(/oe/g, 'e');
  w = w.replace(/ll(ed|er|ing|ers)$/, 'l$1');
  w = w.replace(/nce$/, 'nse');
  return w;
}

export function stripEnglishAffixes(w) {
  let s = w.toLowerCase();
  const suffixes = [
    'ications', 'ication', 'ational', 'ization', 'fulness', 'ousness', 'iveness',
    'ing', 'edly', 'tion', 'sion', 'ment', 'ness', 'able', 'ible', 'ally',
    'ed', 'es', 'ly', 'er', 'or', 'al', 'ic', 'ty', 'ive', 's'
  ];
  for (const suf of suffixes) {
    if (s.endsWith(suf) && s.length - suf.length >= 3) { s = s.slice(0, -suf.length); break; }
  }
  const prefixes = ['non', 'pre', 'post', 'anti', 'inter', 'super', 'under', 'over', 'semi', 'multi', 'micro', 'macro', 'mis', 'dis', 'un', 're', 'sub'];
  for (const pre of prefixes) {
    if (s.startsWith(pre) && s.length - pre.length >= 3) { s = s.slice(pre.length); break; }
  }
  return s;
}
