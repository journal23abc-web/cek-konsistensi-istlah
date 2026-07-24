// tests/semantic.test.js
// Tests only the deterministic candidate-extraction logic in ai/semantic.js —
// the part that runs before anything touches the network. The embedding
// model itself (loaded in assets/js/workers/embedding-worker.js from a CDN)
// cannot be exercised by an offline Node test; that part must be verified
// manually in a browser with an internet connection. See README.md.
import assert from 'node:assert';
import { extractCandidateTerms } from '../assets/js/ai/semantic.js';
import { tokenize } from '../assets/js/core/tokenizer.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  -', name); }
  catch (err) { failed++; console.log('FAIL  -', name); console.log('       ', err.message); }
}

console.log('extractCandidateTerms()');

test('picks up a repeated content word', () => {
  const text = 'The dataset was cleaned. The dataset included firm-level records. Analysts reviewed the dataset carefully.';
  const tokens = tokenize(text);
  const candidates = extractCandidateTerms(text, tokens, new Set());
  assert.ok(candidates.some(c => c.term === 'dataset'));
});

test('excludes stopwords (English and Indonesian)', () => {
  const text = 'yang dan untuk dengan the and for with these those';
  const tokens = tokenize(text);
  const candidates = extractCandidateTerms(text, tokens, new Set());
  assert.strictEqual(candidates.length, 0);
});

test('excludes words already covered by string-based findings', () => {
  const text = 'The corpus was large. The corpus included many documents about the corpus.';
  const tokens = tokenize(text);
  const candidates = extractCandidateTerms(text, tokens, new Set(['corpus']));
  assert.strictEqual(candidates.find(c => c.term === 'corpus'), undefined);
});

test('picks up a repeated Title Case phrase as a candidate', () => {
  const text = 'The Earnings Management construct is central. Earnings Management drives the results. We measure Earnings Management using a standard proxy.';
  const tokens = tokenize(text);
  const candidates = extractCandidateTerms(text, tokens, new Set());
  assert.ok(candidates.some(c => c.term.toLowerCase() === 'earnings management'));
});

test('caps total candidates at maxTotal', () => {
  const words = [];
  for (let i = 0; i < 200; i++) words.push('wordnum' + i + ' ' + 'wordnum' + i);
  const text = words.join('. ');
  const tokens = tokenize(text);
  const candidates = extractCandidateTerms(text, tokens, new Set(), { maxTotal: 10 });
  assert.ok(candidates.length <= 10);
});

console.log('\n' + '-'.repeat(50));
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
