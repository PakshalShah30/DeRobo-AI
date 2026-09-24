# DeRobo — roadmap

## Done: fixes (September 2026)

- [x] **The page was almost unstyled.** `styles.css` held only the last ~2 KB of the
  original stylesheet (tabs, history, dark mode), so the header, hero, editor and cards had
  no styles at all. The stylesheet is rewritten in full, with light and dark themes and a
  phone layout.
- [x] **Controls that did nothing now work:** writing style, creativity, "Preserve
  important terms" (now "Lock numbers, names, quotes & links" plus your own terms) and
  "Highlight changes".
- [x] **Paraphrase and Deep were no different from Humanize and Balanced.** Each mode and
  strength now has its own behaviour, and tests check the difference.
- [x] **Expand padded text with "This is an important consideration."** It now adds prompts
  for your own details and never invents content.
- [x] **Shorten deleted every ", which …" / ", that …" phrase**, which could change the
  meaning. It now only removes padding and redundant pairs.
- [x] **The history panel inserted text as raw HTML** (pasting `<img onerror=…>` would run).
  All user text is now escaped, and history is kept in this browser only.
- [x] **Removed the non-working "Sign in" / "Get started" buttons** and the "Meaning
  preserved" guarantee the code couldn't keep.
- [x] **Readable code:** the logic moved out of a minified single-line `app.js` into a pure
  engine (`src/engine.js`) and a UI layer (`src/app.js`).
- [x] **Tests and CI:** a 16-test `node --test` suite, a CI workflow and a GitHub Pages deploy.

## Phase 1: the robo-speak linter (in progress)

- [x] A 0–100 robo-speak score with every flagged phrase highlighted in place, a reason for
  each, and a suggested fix.
- [x] Score before → after, grouped by category, plus rhythm stats (sentence length variety,
  repeated openers, passive phrases).
- [x] A "What it flags" section generated from the rule list itself.
- [ ] **Fix one at a time:** click a highlighted phrase to apply or dismiss just that fix.
- [ ] **Keyboard flow:** `Ctrl/⌘+Enter` already runs; add `Alt+↑/↓` to step through findings.
- [ ] **Custom rules:** add your own "never say" phrases with a replacement, saved in the
  browser, and import or export them as JSON so a team can share a style list.

## Phase 2: optional AI mode

- [ ] "Bring your own key" rewriting through an OpenAI-compatible or Anthropic endpoint. The
  key stays in the browser and requests go directly from the page; the rule-based mode
  remains the default.
- [ ] A **fact-lock** on AI output (same idea as the-bureau's): reject a rewrite that changes
  numbers, names, quotes or negation, and show why.
- [ ] Side-by-side: rule-based vs AI, with the robo-speak score for each.

## Phase 3: where people write

- [ ] **Browser extension:** lint any `<textarea>` (LinkedIn posts, email, Jira comments) with
  inline highlights.
- [ ] **CLI:** `npx derobo file.md --fail-above 50`, for docs repos and CI. The engine is
  already DOM-free, so this is a thin wrapper.
- [ ] **Presets** for common targets: cover letter, LinkedIn post, status update, release
  notes.

## Phase 4: quality

- [ ] A labelled test corpus of human and stock-phrase-heavy paragraphs, so rule changes are
  measured rather than guessed.
- [ ] Localised rule packs (UK spelling, other languages).
- [ ] An accessibility pass with axe in CI.

## Principles

- Never invent content, and never change facts (numbers, names, quotes, links).
- Every change is explained and can be seen in the diff.
- The score is a style signal, never a claim about who or what wrote the text.
