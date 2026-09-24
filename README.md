# DeRobo

Find the stock phrases, filler and flat rhythm that make writing read as generated, and
fix them. Everything runs in your browser: no server and no account, and your text never
leaves your device.

## Run it

```bash
npm start            # or: python3 -m http.server 4173
```

Open `http://localhost:4173`. There's nothing to install and no build step; any static file
server works, and so does GitHub Pages (`.github/workflows/pages.yml`).

## What it does

**Robo-speak report.** Paste text and you get a 0–100 score (0 reads human, 100 reads like
a template), with every flagged phrase highlighted in place, grouped by kind:

| Category | Examples |
|---|---|
| Filler & throat-clearing | "it is important to note that", "needless to say" |
| Wordy phrasing | "in order to", "due to the fact that", "when it comes to" |
| Buzzwords & stock AI phrases | "delve into", "a testament to", "leverage", "cutting-edge" |
| Stacked transitions | "Furthermore," "Moreover," "In conclusion," |
| Hedging | "may potentially", "I think" |
| Redundancy | "each and every", "end result", "absolutely essential" |

The score also looks at rhythm (sentences all the same length), repeated sentence openers
and very long sentences. **It is a style check, not an AI detector**, and the page says so.

**Modes.**

- **Humanize:** removes filler, stock phrases and stacked transitions. *Strength* decides how
  much it touches: Light fixes only wordy and filler phrases, Balanced adds buzzwords and
  transitions, and Deep adds varied sentence openers and splits very long sentences.
- **Plain words:** Humanize, plus formal words swapped for plain ones ("utilize" → "use",
  "prior to" → "before").
- **Shorten:** cuts intensifiers ("really", "very") and redundant pairs. It never deletes a
  whole clause, which is how meaning gets lost.
- **Expand prompts:** marks vague claims with a bracketed prompt such as
  `[add a number: how much?]`. It never invents content.
- **Grammar:** lowercase "i", repeated words, a/an, stray spaces and common misspellings.

**Controls.**

- **Writing style:** Casual and Natural use contractions (Natural only at medium creativity
  and up), Academic keeps formal transitions and never contracts, and Persuasive drops "I
  think" hedges.
- **Creativity:** at 67 and above, Humanize also swaps in plain words; at Deep strength and
  50 and above, very long sentences are split.
- **Lock numbers, names, quotes & links:** these are masked before any rule runs, so no rule
  can change them. "Also keep" adds your own terms.
- **Highlight changes:** shows a word-level diff of the output.
- **History:** your last 10 results, kept in this browser only.

Every rule is deterministic: the same text and settings always give the same result.

## Project layout

```
index.html        the page
styles.css        all styling (light + dark)
src/engine.js     rules, analyze(), rewrite(), diffWords() — pure, no DOM
src/app.js        wires the page to the engine
tests/            node --test suite for the engine
```

## Test

```bash
npm test          # Node 18+, no dependencies
```

## Roadmap

See [ROADMAP.md](ROADMAP.md).
