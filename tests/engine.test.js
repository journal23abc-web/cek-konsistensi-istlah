// tests/engine.test.js
// Run with: node tests/engine.test.js
// No npm install required — Node's built-in `assert`, ES modules via
// package.json "type": "module". Exits 1 on failure (CI-safe).
import assert from 'node:assert';
import { analyze, levenshtein, identifierStyle, identifierRoot, spellingKey, BUILTIN_GLOSSARY } from '../assets/js/core/engine.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  -', name); }
  catch (err) { failed++; console.log('FAIL  -', name); console.log('       ', err.message); }
}

console.log('Levenshtein distance');
test('identical strings -> 0', () => assert.strictEqual(levenshtein('color', 'color'), 0));
test('one substitution -> 1', () => assert.strictEqual(levenshtein('color', 'colar'), 1));
test('empty string -> length of other', () => assert.strictEqual(levenshtein('', 'abc'), 3));

console.log('\nIdentifier style detection');
test('camelCase detected', () => assert.strictEqual(identifierStyle('userId'), 'camelCase'));
test('snake_case detected', () => assert.strictEqual(identifierStyle('user_id'), 'snake_case'));
test('PascalCase requires internal hump', () => assert.strictEqual(identifierStyle('UserID'), 'PascalCase'));
test('plain capitalized word is NOT PascalCase', () => assert.strictEqual(identifierStyle('Email'), null));
test('kebab-case detected', () => assert.strictEqual(identifierStyle('user-id'), 'kebab-case'));
test('identifierRoot normalizes all styles to the same key', () => {
  assert.strictEqual(identifierRoot('userId'), identifierRoot('user_id'));
  assert.strictEqual(identifierRoot('user_id'), identifierRoot('UserID'));
});

console.log('\nspellingKey (American/British normalization)');
test('colour/color share a key', () => assert.strictEqual(spellingKey('colour'), spellingKey('color')));
test('organise/organize share a key', () => assert.strictEqual(spellingKey('organise'), spellingKey('organize')));
test('centre/center share a key', () => assert.strictEqual(spellingKey('centre'), spellingKey('center')));
test('paediatric/pediatric share a key', () => assert.strictEqual(spellingKey('paediatric'), spellingKey('pediatric')));
test('unrelated words do not collide', () => assert.notStrictEqual(spellingKey('author'), spellingKey('care')));

console.log('\nanalyze() — case variants');
test('flags Website/website mixed usage', () => {
  const f = analyze('The Website was updated. Please check the website again.', {});
  const hit = f.case.find(x => x.key === 'website');
  assert.ok(hit);
  assert.strictEqual(hit.variants.length, 2);
});
test('does NOT flag ordinary sentence-initial capitalization', () => {
  const text = 'This study explores ownership. This finding matters. This result holds. ' +
    'The sample includes this firm and this sector as controls throughout the analysis of this dataset.';
  assert.strictEqual(analyze(text, {}).case.find(x => x.key === 'this'), undefined);
});
test('does NOT flag an ALL-CAPS heading against lowercase body usage', () => {
  const text = 'RESULTS AND DISCUSSION\n\nThe results and discussion below cover three findings, and the discussion continues in the next section with further discussion of the results.';
  const f = analyze(text, {});
  assert.strictEqual(f.case.find(x => x.key === 'discussion' || x.key === 'results'), undefined);
});
test('does NOT flag a whole-line bold sub-heading', () => {
  const text = '**The Influence of Accounting Conservatism on Profit Management**\n\n' +
    'This section discusses conservatism and profit management. The evidence shows conservatism affects profit management repeatedly, and conservatism remains linked to profit management across specifications.';
  const f = analyze(text, {});
  assert.strictEqual(f.case.find(x => ['conservatism', 'management'].includes(x.key)), undefined);
});
test('does NOT flag markdown table-row content', () => {
  const text = '| Variable | The Effect |\n| Leverage | Positive |\n\n' +
    'The effect of leverage is positive throughout, and this positive effect on leverage persists with a positive effect noted repeatedly.';
  const f = analyze(text, {});
  assert.strictEqual(f.case.find(x => x.key === 'effect' || x.key === 'leverage'), undefined);
});
test('excludes reference-list entries', () => {
  const text = 'The study examines audit quality in depth. Audit quality remains central, and audit quality is discussed extensively across this analysis of audit quality.\n\n' +
    '# REFERENCES\n\nSmith, J. (2020). Audit Quality And Earnings Management. Journal of Audit Quality, 5(2), 1-20.';
  assert.strictEqual(analyze(text, {}).case.find(x => x.key === 'quality'), undefined);
});
test('STILL flags a genuine mid-sentence casing inconsistency', () => {
  const text = 'The Website was slow today. Please check the website again tomorrow, since the Website has been unstable, and the website team is investigating the Website issue further this week.';
  assert.ok(analyze(text, {}).case.find(x => x.key === 'website'));
});

console.log('\nanalyze() — hyphenation variants');
test('flags e-mail vs email', () => {
  const f = analyze('Send an e-mail. Or just use email instead.', {});
  assert.ok(f.hyphenation.find(x => x.key === 'email'));
});

console.log('\nanalyze() — identifier naming consistency');
test('flags userId vs user_id vs UserID', () => {
  const f = analyze('Set userId first. The database column is user_id. The API returns UserID.', {});
  const hit = f.identifier.find(x => x.key === 'userid');
  assert.ok(hit);
  assert.strictEqual(hit.variants.length, 3);
});

console.log('\nanalyze() — spelling system (AmE/BrE)');
test('flags organize vs organise mixed in one document', () => {
  assert.ok(analyze('We organize the data. Later, they organise it differently.', {}).spelling.length > 0);
});
test('does NOT flag consistent American spelling', () => {
  assert.strictEqual(analyze('We organize the color scheme and the center of the analysis.', {}).spelling.length, 0);
});

console.log('\nanalyze() — glossary (built-in + custom)');
test('built-in glossary catches "web site" vs "website"', () => {
  const glossaryLines = BUILTIN_GLOSSARY.split('\n');
  const f = analyze('We built a website. The web site loads fast.', { glossaryLines });
  assert.ok(f.glossary.find(x => x.key === 'web site'));
});
test('custom glossary line works standalone', () => {
  const f = analyze('The article discusses AI. This post also discusses AI.', { glossaryLines: ['article, post'] });
  assert.ok(f.glossary.find(x => x.key === 'post'));
});

console.log('\nanalyze() — acronym consistency');
test('flags an acronym defined two different ways', () => {
  const text = 'We use Artificial Intelligence (AI) broadly. Later, an Analog Interface (AI) is discussed.';
  assert.ok(analyze(text, { checkAcronym: true }).acronym.find(x => x.key === 'AI'));
});
test('flags a repeated all-caps token never defined', () => {
  const text = 'The NLP pipeline was trained. NLP performance improved. We evaluate NLP again.';
  const f = analyze(text, { checkAcronym: true, checkUndefinedAcronyms: true });
  assert.ok(f.acronym.find(x => x.key === 'NLP-undefined'));
});
test('does not flag a properly defined, consistently used acronym', () => {
  const text = 'We use Natural Language Processing (NLP) throughout. NLP performance improved over time.';
  const f = analyze(text, { checkAcronym: true, checkUndefinedAcronyms: true });
  assert.strictEqual(f.acronym.find(x => x.key === 'NLP-undefined' || x.key === 'NLP'), undefined);
});
test('common acronyms (US, UK, EU...) are not flagged as undefined', () => {
  const text = 'The study covered the US, the UK, and the EU. The US sample was largest.';
  assert.strictEqual(analyze(text, { checkAcronym: true, checkUndefinedAcronyms: true }).acronym.length, 0);
});

console.log('\nanalyze() — fuzzy match false-positive guards');
test('does NOT flag legitimate inflection (delete/deleted)', () => {
  const text = 'We delete stale records. The records were deleted last night and deleted again today for safety margins.';
  const f = analyze(text, {});
  assert.strictEqual(f.fuzzy.find(x => x.variants.some(v => v.form === 'delete') && x.variants.some(v => v.form === 'deleted')), undefined);
});
test('does NOT flag common short function words (there/these/those/where/while)', () => {
  const text = 'These results matter. There are several reasons. Those findings hold while these effects persist, where this occurs across those cases and these settings, whereas there they differ.';
  assert.strictEqual(analyze(text, {}).fuzzy.length, 0);
});
test('does NOT flag two independently common content words (accounting/according)', () => {
  const text = 'The accounting standard applies broadly. According to the report, accounting practices vary. ' +
    'Accounting rules differ according to jurisdiction, and accounting quality is assessed according to several accounting criteria repeatedly according to accounting norms.';
  const f = analyze(text, {});
  assert.strictEqual(f.fuzzy.find(x => x.key === ['accounting', 'according'].sort().join('~')), undefined);
});
test('DOES flag a plausible typo pair (consistant/consistent)', () => {
  const text = 'The results were consistant across trials. Later analysis confirmed the data were consistent.';
  assert.ok(analyze(text, {}).fuzzy.find(x => x.key === ['consistant', 'consistent'].sort().join('~')));
});
test('STILL flags a rare typo next to a common correct form', () => {
  const text = 'The Hausman test was applied. We also ran the Hausman test again. The hassan test result confirmed the model choice.';
  assert.ok(analyze(text, {}).fuzzy.find(x => x.key === ['hausman', 'hassan'].sort().join('~')));
});
test('fuzzy does not duplicate a pair already covered by the spelling category', () => {
  const f = analyze('We organize the data. Later they organise it.', {});
  assert.strictEqual(f.fuzzy.find(x => x.key === ['organise', 'organize'].sort().join('~')), undefined);
});

console.log('\nanalyze() — two-word phrase consistency');
test('flags a two-word term written with mixed casing', () => {
  const text = 'The Audit Committee reviewed the filing. Later, the audit committee met again, and the audit committee issued a statement, while the Audit Committee chair signed off.';
  const f = analyze(text, {});
  const hit = f.phrase.find(x => x.key === 'audit committee');
  assert.ok(hit, 'expected a phrase-casing finding for "audit committee"');
});
test('flags a two-word term written in swapped order', () => {
  const text = 'The audit committee approved the report. In another section, the committee audit was described differently, and later the audit committee reviewed it again while the committee audit process continued.';
  const f = analyze(text, {});
  const hit = f.reorder.find(x => x.key === 'audit committee');
  assert.ok(hit, 'expected a word-order finding for "audit committee" / "committee audit"');
});
test('does NOT flag a two-word phrase used consistently', () => {
  const text = 'The sample size was fixed. The sample size did not change. Every subgroup used the same sample size throughout the sample size calculation.';
  const f = analyze(text, {});
  assert.strictEqual(f.phrase.find(x => x.key === 'sample size'), undefined);
  assert.strictEqual(f.reorder.find(x => x.key === 'sample size'), undefined);
});
test('does NOT form a phrase across a sentence boundary', () => {
  const text = 'The result was significant. The next section begins differently, and the next section begins again, and the next section begins once more here.';
  const f = analyze(text, {});
  // "significant. The" must never be treated as a two-word phrase
  assert.strictEqual(f.phrase.find(x => x.key.includes('significant')), undefined);
});

console.log('\n' + '-'.repeat(50));
console.log(passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
