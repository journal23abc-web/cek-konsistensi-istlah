import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGlossary, findGlossaryMatches, replaceGlossaryMatches } from '../assets/js/core/glossary-engine.js';
import { analyzeIdentifiers, stripCommentsAndStrings } from '../assets/js/core/identifier-engine.js';
import { extractTerms } from '../assets/js/core/term-extractor.js';

test('glossary supports multiword and unicode-safe boundaries', () => {
  const { rules, issues } = compileGlossary([{ canonical: 'kata sandi', variants: 'password, kata kunci' }]);
  assert.equal(issues.length, 0);
  const text = 'Password bukan passwordku. Gunakan kata   kunci.';
  const matches = findGlossaryMatches(text, rules);
  assert.equal(matches.length, 2);
  assert.equal(replaceGlossaryMatches(text, matches), 'Kata sandi bukan passwordku. Gunakan kata sandi.');
});

test('conflicting glossary mappings are rejected', () => {
  const result = compileGlossary([{ canonical: 'pengguna', variants: 'user' }, { canonical: 'akun', variants: 'user' }]);
  assert.equal(result.issues.length, 1);
});

test('identifier analyzer ignores comments and strings', () => {
  const code = `const userId = 1; // user_id\nconst label = "user_id"; const user_id = 2;`;
  assert.ok(!stripCommentsAndStrings(code).includes('"user_id"'));
  const result = analyzeIdentifiers(code);
  assert.equal(result.inconsistent.length, 1);
  assert.deepEqual(result.inconsistent[0].variants.map((x) => x.name).sort(), ['userId', 'user_id']);
});

test('term extraction prioritizes repeated phrases', () => {
  const result = extractTerms('basis data penting. basis data terpusat. basis data aman. pengguna aktif. pengguna aktif.');
  assert.ok(result.candidates.some((x) => x.term === 'basis data'));
});
