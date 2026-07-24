# Audit log

This file records what was actually verified for this tool, how, and what was found
— rather than just asserting "it's accurate." Written after testing against a real
submitted manuscript (an accounting/audit empirical study, ~7,480 words, extracted
from a `.docx` via `pandoc -t markdown`).

## What was tested and how

- **All of `core/`** is covered by `tests/engine.test.js` (37 assertions) and is
  pure, dependency-free, DOM-free JavaScript — run directly with `node tests/engine.test.js`,
  no browser, no network, no mocking required. This is the same code the browser
  loads; nothing is reimplemented for the test.
- **Candidate extraction for the AI layer** is covered by `tests/semantic.test.js`
  (5 assertions), also offline.
- **The embedding model / Web Worker itself was NOT run end-to-end in an automated
  test.** The sandbox this tool was built in has no browser and no network access to
  the CDN/Hugging Face endpoints the worker depends on. The worker code was written
  carefully against the documented `transformers.js` API and syntax-checked
  (`node --check`), but its actual runtime behavior in a real browser has not been
  observed by the tool's author. Verify it yourself on first use, and treat its
  output with the same "unverified candidate" framing the UI already gives it.

## What real-world testing against the manuscript found and fixed

The first pass against the real manuscript produced **183 case-variant groups** and
**90 fuzzy-match groups** — almost entirely false positives:

| Cause | Example | Fix |
|---|---|---|
| Ordinary sentence-initial capitalization | `This`/`this`, `The`/`the` | Added boundary detection (`.`, `!`, `?`, `:`, blank-line paragraph breaks) so a word capitalized only because it starts a sentence is not compared against its mid-sentence lowercase form. |
| ALL-CAPS section headings | `RESULTS AND DISCUSSION` vs body text | Lines that are entirely uppercase letters are excluded from the case check. |
| Whole-line **bold** sub-headings | `**The Influence of Accounting Conservatism on Profit Management**` | Any line wrapped entirely in `**bold**` is treated as a heading, regardless of wording — more general than an enumerated heading-word list. |
| Markdown table rows | Word-wrapped cell fragments like `\| Managerial \| The level of \|` | Lines with 2+ `\|` characters are excluded outright; cell fragments are not sentences. |
| Reference-list title-casing | APA-style journal/article titles capitalize every content word as citation convention | Once a `References`/`Bibliography` heading is found, everything after it is excluded from the case and fuzzy checks. |
| Common short function words | `these`/`there`/`those`, `where`/`while`/`white` | Raised the fuzzy-match minimum word length from 5 to 6 (eliminated nearly all of these) and added an explicit stopword list for the remaining longer function words. |
| Two independently common content words | `accounting`(63) / `according`(5) | Added a cap on the *rarer* variant's raw count — genuine typos are usually rare next to a common correct form; two words that are both frequent are more likely two real, different words. |

After these fixes: **43 case groups, 41 fuzzy groups** on the same manuscript — and
every fix above has a corresponding regression test in `tests/engine.test.js` proving
both that the false positive is gone *and* that a matching true positive (a genuine
mid-sentence casing inconsistency, a genuine rare typo, etc.) is still caught.

## What the tool found in that manuscript that looks like a genuine issue

Reported for transparency, not as a claim these are definitely errors — a human
editor should confirm each one:

- **Acronym `MRA`** defined three different ways in the same manuscript
  (`Moderated Regression Analysis`, `Moderated Regression Analysis`, and
  `Moderation Test`).
- **Acronym `FEM`** defined as both `Fixed Effect Model` and `Fixed Effects Model`
  (singular/plural mismatch).
- **Acronym `KAP`** used four times with no `Full Term (KAP)` definition found in
  the text.
- Several of the manuscript's own key constructs (`Managerial Ownership`,
  `Earnings Management`, `Audit Quality`, `Accounting Conservatism`) appear both
  Title Case and lowercase dozens of times each — plausibly a deliberate
  proper-noun-style choice for defined constructs used inconsistently, but this is
  exactly the kind of question a reviewer might raise, so it's reported rather than
  silently dropped now that the heading/table/reference noise has been removed.

## Known-open items

- The heading/table/reference exclusion logic is heuristic (line-shape based), not a
  real document-structure parser. A manuscript with unusual formatting (headings that
  aren't bold or all-caps, tables that aren't pipe-delimited markdown) may leak some
  noise back into the case/fuzzy checks. If you see a flood of headings or table
  content in your results, that's the likely cause — check `core/boundaries.js`.
- The AI similarity threshold (default 0.86) was chosen by reasoning about the
  model's typical score distribution, not by tuning against a labeled dataset of
  known synonym/non-synonym pairs in this domain. Treat it as a starting point and
  adjust the slider if you see too much or too little.
