#!/usr/bin/env node
// make-deck.mjs - command-line twin of generator.html. Same core (deck-core.cjs).
// Usage: node make-deck.mjs <project-dir> [--repo <folder>] [--title "Title"] [--out deck.html]
// Needs: npm install (reveal.js) and Mermaid CLI (mmdc) on PATH or via npx.
// Most people should use generator.html instead: it needs no Node and runs from file://.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url'; import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const core = require('./deck-core.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const projectDir = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
if (!projectDir) { console.error('Usage: node make-deck.mjs <project-dir> [--repo name] [--title t] [--out file]'); process.exit(1); }
const read = p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

let repoName = opt('--repo');
if (!repoName) {
  const cand = fs.readdirSync(projectDir, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(projectDir, d.name, '.rederive', 'map.md')));
  if (cand.length !== 1) { console.error('Give --repo <folder>. Found ' + cand.length + ' folders with .rederive/map.md.'); process.exit(1); }
  repoName = cand[0].name;
}
const map = read(path.join(projectDir, repoName, '.rederive', 'map.md'));
if (!map) { console.error('Missing map.md'); process.exit(1); }
const log = read(path.join(projectDir, repoName, '.rederive', 'log.md')) || '';
const notesDir = path.join(projectDir, 'notes');
const tables = fs.existsSync(notesDir) ? fs.readdirSync(notesDir).filter(f => /\.md$/.test(f) && f !== 'intuition.md').map(f => ({ file: f, text: read(path.join(notesDir, f)) })) : [];
const intuition = read(path.join(notesDir, 'intuition.md')) || '';

const haveMmdc = () => spawnSync('mmdc', ['--version']).status === 0;
function render(src) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-')), i = path.join(tmp, 'd.mmd'), o = path.join(tmp, 'd.svg');
  fs.writeFileSync(i, src);
  const [bin, pre] = haveMmdc() ? ['mmdc', []] : ['npx', ['-y', '-p', '@mermaid-js/mermaid-cli', 'mmdc']];
  const r = spawnSync(bin, [...pre, '-i', i, '-o', o, '-b', 'transparent', '-q'], { encoding: 'utf8' });
  if (r.status === 0 && fs.existsSync(o)) return fs.readFileSync(o, 'utf8');
  console.warn('WARNING: mmdc failed: ' + String(r.stderr || r.error).slice(0, 200)); return null;
}
const diagDir = path.join(projectDir, 'diagrams');
const diagrams = fs.existsSync(diagDir) ? fs.readdirSync(diagDir).filter(f => f.endsWith('.mmd')).sort().map(f => {
  const d = core.parseDiagramSource(f, fs.readFileSync(path.join(diagDir, f), 'utf8'));
  return { file: f, meta: d.meta, src: d.clean, svg: render(d.clean) };
}) : [];
const rv = p => fs.readFileSync(path.join(here, 'node_modules', 'reveal.js', p), 'utf8');
const assets = { revealCss: rv('dist/reveal.css'), resetCss: rv('dist/reset.css'), revealJs: rv('dist/reveal.js'), notesJs: rv('plugin/notes/notes.js'), zoomJs: rv('plugin/zoom/zoom.js') };
const html = core.build({ map, log, repoName, title: opt('--title'), diagrams, tables, intuition, assets });
const out = opt('--out', path.join(projectDir, 'deck', 'index.html'));
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html);
console.log(`OK ${out} (${(html.length / 1024).toFixed(0)} KB, ${diagrams.length} diagrams)`);
