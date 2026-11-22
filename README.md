# code-comprehension-lab

A method and toolkit for understanding agent-written code well enough to explain it, change it, and trust it.

## Contents

| Path | What it is |
|---|---|
| `docs/Code-Comprehension-Lab-Guide.pdf` | The five-phase method (Orient, Map structure, Trace behavior, Animate mechanics, Verify) with Codex CLI setup, prompts, and a worked example. ASD-STE100 style. |
| `docs/Rederive-Lab-Guide-Codex.pdf` | Earlier guide: root directory plus Project1..N, using rederive in Codex CLI. |
| `deckkit/make-deck.mjs` | Builds one self-contained reveal.js HTML deck from a rederive `map.md`, Mermaid diagrams, and notes. |
| `deckkit/sample-project-input/` | Sample input (illustrative map written by hand, not rederive output; example values are invented). |
| `deckkit/SAMPLE-deck.html` | The deck built from the sample. Open in a browser. Space = next step, S = speaker notes. |
| `diagrams/*.mmd` | Mermaid sources for the guide's diagrams (pbgc-r5-generator worked example). |

## Use the deck builder

Needs Node 18+ and Mermaid CLI (`mmdc`) on a personal machine. The output file needs no network.

```
cd deckkit
npm install
node make-deck.mjs <project-dir> [--repo <folder>] [--title "Title"] [--out deck.html]
```

Build the deck only after you have finished rederive: `map.md` contains the answers. Check a few "Where" lines against the code before presenting.

## Status

Written without running the tools inside Codex CLI. The deck builder was tested headless on the sample only.
