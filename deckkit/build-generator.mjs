#!/usr/bin/env node
// build-generator.mjs - assembles generator.html (ONE file: UI + reveal.js + mermaid + deck-core + sample).
// Run on a machine with Node after `npm install`. The result needs nothing and works from file://.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const nm = p => fs.readFileSync(path.join(here, 'node_modules', p), 'utf8');
const rv = p => nm('reveal.js/' + p);
const jsStr = s => JSON.stringify(s).replace(/<\//g, '<\\/');
const raw = s => s.replace(/<\/script/gi, '<\\/script').replace(/^\/\/# sourceMappingURL=.*$/gm, '');
const assets = { revealCss: rv('dist/reveal.css'), resetCss: rv('dist/reset.css'), revealJs: rv('dist/reveal.js'), notesJs: rv('plugin/notes/notes.js'), zoomJs: rv('plugin/zoom/zoom.js') };
// sample input: every text file of sample/Project1 (path kept, so the folder logic is the same)
const sample = []; const root = path.join(here, 'sample', 'Project1');
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
  if (e.isDirectory()) { if (e.name !== 'deck') walk(p); } else if (/\.(md|mmd)$/.test(e.name)) sample.push({ path: path.relative(root, p).split(path.sep).join('/'), text: fs.readFileSync(p, 'utf8') }); } })(root);
let t = fs.readFileSync(path.join(here, 'generator.template.html'), 'utf8');
const rep = (k, v) => { const i = t.indexOf(k); if (i < 0) throw new Error('marker ' + k); t = t.slice(0, i) + v + t.slice(i + k.length); };
rep('/*MERMAID*/', raw(nm('mermaid/dist/mermaid.min.js')));
rep('/*CORE*/', raw(fs.readFileSync(path.join(here, 'deck-core.cjs'), 'utf8')));
rep('/*ASSETS*/', jsStr(assets).replace(/^/, ''));
rep('/*SAMPLE*/', jsStr(sample));
fs.writeFileSync(path.join(here, '..', 'generator.html'), t);
console.log('generator.html', (t.length / 1024 / 1024).toFixed(2), 'MB');
