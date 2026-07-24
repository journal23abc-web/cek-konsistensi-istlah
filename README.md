# Terminology & Variable Consistency Checker (v2)

A modular, static app for checking a manuscript's terminology, casing, hyphenation,
variable naming, acronym definitions, and American/British spelling — plus an
**optional** AI-assisted layer that compares *meaning* rather than spelling, to find
synonym candidates a fixed glossary wouldn't. Runs entirely client-side; the
deterministic checks work fully offline, and only the AI layer needs the internet
(once, to fetch a model).

## Structure

```
index.html                          App shell
assets/css/styles.css                Design tokens and components
assets/js/app.js                     UI orchestration — wires the page to core/ and ai/
assets/js/core/
  tokenizer.js                        Tokenizing, escaping, context snippets
  levenshtein.js                      Edit distance, prefix/suffix overlap
  identifier.js                       camelCase/snake_case/PascalCase/kebab-case detection
  spelling.js                         American/British pattern normalization, affix stripping
  boundaries.js                       Sentence/heading/table/reference-section awareness
  glossary.js                         Built-in synonym pairs + matcher
  acronym.js                          Acronym-definition consistency
  engine.js                           Orchestrates all of the above into analyze()
  report.js                           Markdown report builder
assets/js/ai/semantic.js              Candidate-term extraction + Worker controller (main thread)
assets/js/workers/embedding-worker.js Web Worker: loads the embedding model, computes similarity
tests/engine.test.js                  Tests for core/ (offline, deterministic)
tests/semantic.test.js                Tests for candidate extraction (offline, no model)
serve.js                              Zero-dependency static server for local dev
```

Every file under `core/` is a plain ES module with no DOM access and no dependencies,
so the exact code that ships to the browser is what `tests/*.test.js` imports and runs.

## Running locally

ES modules cannot be opened directly via `file://`. Start a local server first:

```
npm run serve
```

Then open `http://localhost:8000`. `serve.js` has no dependencies — it is a ~30-line
Node script, not an installed package — so there is nothing to `npm install`.

## Running the tests

```
npm test
```

No `npm install` needed for the tests either. `tests/engine.test.js` covers every
deterministic check with 37 assertions, including specific regression tests for false
positives that came up while testing this tool against a real submitted manuscript
(see `AUDIT.md`). `tests/semantic.test.js` covers the candidate-extraction logic that
runs *before* anything touches the network — the embedding model itself is not
something an offline test can assert against (see "Honest limitations" below).

## Deploying to GitHub Pages

Push this folder to the repository root (or `/docs`), then
**Settings → Pages → Deploy from a branch**. No build step — GitHub Pages serves
static files over HTTPS, which is exactly what ES modules require.

## What it checks

**Deterministic (offline, tested):**
- Casing variants — `Website` vs `website`, aware of sentence/heading position so
  ordinary capitalization at the start of a sentence isn't misflagged.
- Hyphenation/spacing — `e-mail` vs `email`.
- Variable naming consistency — `userId` vs `user_id` vs `UserID`.
- American vs British spelling mixed in one document — detected by normalizing
  spelling *patterns* (`-ize`/`-ise`, `-or`/`-our`, `paediatric`/`pediatric`, etc.),
  not a fixed pair list.
- Acronym consistency — an acronym defined two different ways, or (optionally)
  used repeatedly without ever being introduced.
- Glossary — a built-in list of ~30 academic/technical synonym pairs, plus any you add.
- Fuzzy spelling-variant candidates — Levenshtein distance, filtered against English
  inflection, common function words, and pairs already explained by the spelling check.
- All of the above ignore section headings, whole-line **bold** sub-headings,
  markdown table rows, and the reference list — none of that is the author's own
  running prose, and treating it as such was the single biggest source of false
  positives in earlier testing (see `AUDIT.md`).

**AI-assisted (optional, needs internet once):**
- Extracts recurring content words and repeated Title Case phrases not already
  explained by a deterministic check, embeds them with a small multilingual
  sentence-transformer model (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, run
  locally in a Web Worker via `transformers.js` from a CDN), and surfaces pairs
  whose meaning is close even though their spelling is not — e.g. `dataset` /
  `corpus`. This is the part of the tool that can catch "different word, same
  meaning" *without* you having to list the pair yourself.

## Honest limitations

- **The AI layer is probabilistic and cannot be unit-tested the way the rest of the
  tool is.** `tests/semantic.test.js` verifies the candidate-selection logic (which
  words get sent for comparison), but there is no automated test that asserts "these
  two words are semantically close" — that would require the actual model, a live
  network call, and a judgment call about what "close enough" means. Every AI
  finding is labeled as an unverified candidate for a reason: read the context and
  decide for yourself.
- **A high similarity score is not proof of synonymy**, and a pair the model misses
  is not proof the words are unrelated. Sentence-embedding models are good at
  topical/contextual closeness, not at the precise lexical-synonym judgment a human
  editor makes. Treat the AI panel as a wider net with a lower hit rate, not a
  smarter version of the glossary.
- **The AI layer needs the internet the first time** (to fetch the model, roughly
  30–90 MB depending on the browser's cache state) and needs a device capable of
  running a small transformer model client-side. If it fails — no connection, the
  CDN is unreachable, the browser is memory-constrained — the deterministic report
  above it is completely unaffected; the two are independent by design.
- **The deterministic checks are still text-pattern heuristics**, not a real
  dictionary or a parser of your target journal's house style. See the in-app hint
  text and the built-in-glossary note in the UI for specifics — those limitations
  are unchanged from earlier versions of this tool and are not solved by adding AI;
  they are two different, complementary ways of catching different classes of
  problems.

## Privacy

The deterministic checks never send anything anywhere. The AI layer sends only the
short candidate terms/phrases it selects (not your full manuscript) to a CDN to fetch
a public model file — the manuscript text itself is never uploaded; embedding
computation happens locally in your browser after the model is downloaded.
