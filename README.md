# code-comprehension-lab

A method and toolkit for understanding agent-written code well enough to explain it, change it, and trust it.

## The deck builder: `generator.html`

One HTML file. Open it from disk (`file://`). No Node, no Python, no server, no network. Works in a locked-down office browser.

1. Open `generator.html`.
2. Click **Choose project folder** and pick your `ProjectN` folder (it holds `<repo>/.rederive/map.md`, `diagrams/*.mmd`, `notes/*.md`). Or use **Or choose files**, or **Use the built-in sample**.
3. Click **Build deck**, then **Download deck (.html)**.

The deck is also one self-contained file. Space = next step, S = speaker notes, O = overview, Alt+click = zoom. Add `?print-pdf` to the address to print a handout.

What goes into the deck:
- `map.md` (rederive): root problem, then per decision: problem, constraints that break naive designs (one at a time), options, the decision, "where it lives in the code".
- `diagrams/*.mmd` (Mermaid): drawn in the browser. Header comments: `%% decision: D2`, `%% title: ...`, `%% caption: ...`, `%% build: true` (flowchart/state diagrams draw one node at a time).
- `notes/frames*.md` and `notes/oracle*.md` (markdown tables): frame tables reveal one row per step.
- `notes/intuition.md` (`## D2` sections): "in plain words" slide per decision.
- `log.md` (rederive): speaker notes only, never on the slide.

Build the deck only after you have finished rederive: `map.md` contains the answers. Check a few "Where" lines against the code before presenting. PowerPoint output is not built.

## Repo layout

| Path | What it is |
|---|---|
| `generator.html` | The single-file deck builder (UI + reveal.js + Mermaid + builder code + sample, about 2.7 MB). |
| `docs/Code-Comprehension-Lab-Guide.pdf` | The five-phase method with Codex CLI setup, prompts, worked example (ASD-STE100 style). |
| `docs/Rederive-Lab-Guide-Codex.pdf` | Earlier guide: root directory plus Project1..N with rederive in Codex CLI. |
| `docs/pbgc-r5-guide.html` | First guide: explanation of pbgc-r5-generator with diagrams. |
| `deckkit/` | Sources of the builder: `deck-core.cjs` (shared logic), `generator.template.html`, `build-generator.mjs`, `make-deck.mjs` (command-line twin), `sample/`. |
| `diagrams/*.mmd` | Mermaid sources of the guide's diagrams. |
| `tools/` | `render-diagrams.sh`, and the scripts that regenerate the two PDFs. |

## Rebuild

```
cd deckkit && npm install
node build-generator.mjs        # writes ../generator.html
node make-deck.mjs sample/Project1 --out sample/SAMPLE-deck.html   # CLI twin; needs mmdc
cd .. && tools/render-diagrams.sh && python3 tools/make_lab_guide_pdf.py   # needs reportlab, mmdc
```

## Status

The tools named in the guide (Codex, rederive, qgraphflow and others) were not run inside Codex CLI. The generator was tested headless in Chromium from `file://` on the sample project: folder upload, built-in sample, download, and opening the downloaded deck (35 slides, no script errors, no network requests). The sample map is hand-written in rederive's format, and its example values are invented.
