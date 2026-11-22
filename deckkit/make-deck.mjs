#!/usr/bin/env node
// make-deck.mjs - build ONE self-contained reveal.js HTML file from a rederive map.
//
// Usage:
//   node make-deck.mjs <project-dir> [--repo <repo-folder-name>] [--title "Title"] [--out deck.html]
//
// Reads (all optional except map.md):
//   <project-dir>/<repo>/.rederive/map.md     decision map written by rederive
//   <project-dir>/<repo>/.rederive/log.md     your session log  -> speaker notes only
//   <project-dir>/diagrams/*.mmd              Mermaid diagrams (see header comments below)
//   <project-dir>/notes/frames*.md            frame tables (markdown tables), one row = one build step
//   <project-dir>/notes/oracle*.md            oracle / commutative-test tables
//   <project-dir>/notes/intuition.md          "## D1" sections of plain-words explanation
//
// Diagram header comments (first lines of a .mmd file):
//   %% decision: D2        attach the diagram to decision D2 (default: architecture section)
//   %% title: My title     slide title
//   %% caption: text       caption under the picture
//   %% build: true         reveal nodes and edges one step at a time (flowchart / state diagrams)
//
// The output file needs no network and no server. reveal.js and the SVG pictures are inside it.
// Needs Node 18+ and reveal.js (npm install reveal.js). Diagram rendering needs Mermaid CLI (mmdc).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const projectDir = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
if (!projectDir) { console.error('Usage: node make-deck.mjs <project-dir> [--repo name] [--title t] [--out file]'); process.exit(1); }

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const read = p => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const warn = m => console.warn('WARNING: ' + m);

// ---------- find the repo ----------
let repoName = opt('--repo');
if (!repoName) {
  const cand = fs.readdirSync(projectDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(projectDir, d.name, '.rederive', 'map.md')));
  if (cand.length !== 1) { console.error('Give --repo <folder>. Found ' + cand.length + ' folders with .rederive/map.md.'); process.exit(1); }
  repoName = cand[0].name;
}
const mapPath = path.join(projectDir, repoName, '.rederive', 'map.md');
const mapText = read(mapPath);
if (!mapText) { console.error('Missing ' + mapPath); process.exit(1); }

// ---------- parse map.md (format from rederive SKILL.md) ----------
function parseMap(text) {
  const out = { repo: repoName, built: '', date: '', root: '', decisions: [] };
  const lines = text.split(/\r?\n/);
  let cur = null, key = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if ((m = line.match(/^repo:\s*(.*)$/))) {
      for (const part of m[0].split('|')) {
        const [k, ...v] = part.split(':'); const val = v.join(':').trim();
        if (/repo/.test(k)) out.repo = val || out.repo;
        else if (/built from/.test(k)) out.built = val;
        else if (/date/.test(k)) out.date = val;
      }
      continue;
    }
    if ((m = line.match(/^root problem:\s*(.*)$/i))) { out.root = m[1]; key = 'root'; continue; }
    if ((m = line.match(/^##\s+(D\d+)\.\s*(.*)$/))) {
      cur = { id: m[1], title: m[2], fields: {}, where: [] };
      out.decisions.push(cur); key = null; continue;
    }
    if (!cur) { if (key === 'root' && line.trim()) out.root += ' ' + line.trim(); continue; }
    if ((m = line.match(/^-\s+([A-Za-z][A-Za-z ,]*?):\s*(.*)$/)) ) {
      const k = m[1].toLowerCase().startsWith('constraints') ? 'constraints' : m[1].toLowerCase();
      key = k;
      if (k === 'where') { cur.where.push(m[2]); }
      else cur.fields[k] = (cur.fields[k] ? cur.fields[k] + '\n' : '') + m[2];
      continue;
    }
    if (key && line.trim()) {
      if (key === 'where') cur.where.push(line.trim().replace(/^[-*]\s*/, ''));
      else cur.fields[key] = (cur.fields[key] ? cur.fields[key] + '\n' : '') + line.trim();
    }
  }
  return out;
}
const map = parseMap(mapText);
if (!map.decisions.length) { console.error('No "## D1. ..." sections found in map.md'); process.exit(1); }

// constraints: "1. text -> breaks: naive"
const parseConstraints = s => (s || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const t = l.replace(/^\d+[.)]\s*/, '');
  const [a, ...b] = t.split(/->\s*breaks:\s*/i);
  return { rule: a.trim(), breaks: b.join(' ').trim() };
});
// options: lines "- name: tradeoff" or free text
const parseOptions = s => {
  let lines = (s || '').split('\n').map(l => l.trim()).filter(Boolean);
  // one line with several "name: trade-off." parts -> split into parts
  if (lines.length === 1) lines = lines[0].split(/\.\s+(?=[A-Za-z][^.:]{0,50}:)/).map(x => x.replace(/\.$/, ''));
  return lines.map(l => l.replace(/^[-*\d.)]+\s*/, '')).filter(Boolean).map(l => {
  const i = l.indexOf(':'); return i > 0 && i < 60 ? { name: l.slice(0, i).trim(), tradeoff: l.slice(i + 1).trim() } : { name: '', tradeoff: l };
  });
};
// where: "path::symbol - role"
const parseWhere = s => { const [loc, ...r] = s.split(/\s+-\s+/); return { loc: loc.trim(), role: r.join(' - ').trim() }; };

// ---------- log.md -> speaker notes ----------
const logText = read(path.join(projectDir, repoName, '.rederive', 'log.md')) || '';
const logById = {};
for (const sec of logText.split(/^##\s+/m).slice(1)) {
  const id = (sec.match(/^(D\d+)\./) || [])[1]; if (id) logById[id] = sec.split('\n').slice(1).join('\n').trim();
}

// ---------- markdown tables (frames / oracle) and intuition ----------
function mdTables(text) {
  // returns [{title, head:[], rows:[[]]}]
  const res = []; let title = '', buf = [];
  const flush = () => {
    if (buf.length >= 2) {
      const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(buf[0]); const rows = buf.slice(2).map(cells);
      res.push({ title, head, rows });
    }
    buf = [];
  };
  for (const l of text.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(l)) { flush(); title = l.replace(/^#+\s*/, ''); }
    else if (l.trim().startsWith('|')) buf.push(l);
    else flush();
  }
  flush(); return res;
}
const notesDir = path.join(projectDir, 'notes');
const tableFiles = fs.existsSync(notesDir) ? fs.readdirSync(notesDir).filter(f => /^(frames|oracle).*\.md$/.test(f)).sort() : [];
const intuitionText = read(path.join(notesDir, 'intuition.md')) || '';
const intuition = {};
for (const sec of intuitionText.split(/^##\s+/m).slice(1)) {
  const id = (sec.match(/^(D\d+)/) || [])[1]; if (id) intuition[id] = sec.split('\n').slice(1).join('\n').trim();
}

// ---------- diagrams ----------
function haveMmdc() { return spawnSync('mmdc', ['--version'], { encoding: 'utf8' }).status === 0; }
function renderMermaid(src) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'));
  const inp = path.join(tmp, 'd.mmd'), outp = path.join(tmp, 'd.svg'); fs.writeFileSync(inp, src);
  const cmds = haveMmdc() ? [['mmdc', []]] : [['npx', ['-y', '-p', '@mermaid-js/mermaid-cli', 'mmdc']]];
  for (const [bin, pre] of cmds) {
    const r = spawnSync(bin, [...pre, '-i', inp, '-o', outp, '-b', 'transparent', '-q'], { encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(outp)) return fs.readFileSync(outp, 'utf8');
    warn('mmdc failed: ' + (r.stderr || r.error || '').toString().slice(0, 200));
  }
  return null;
}
const diagDir = path.join(projectDir, 'diagrams');
const diagrams = [];
if (fs.existsSync(diagDir)) {
  for (const f of fs.readdirSync(diagDir).filter(f => f.endsWith('.mmd')).sort()) {
    const src = fs.readFileSync(path.join(diagDir, f), 'utf8');
    const meta = {}; for (const m of src.matchAll(/^%%\s*(decision|title|caption|build)\s*:\s*(.*)$/gm)) meta[m[1]] = m[2].trim();
    if (!meta.decision) { const m = f.match(/\bD(\d+)\b/); if (m) meta.decision = 'D' + m[1]; }
    const clean = src.replace(/^%%\s*(decision|title|caption|build)\s*:.*$/gm, '');
    const svg = renderMermaid(clean);
    diagrams.push({ file: f, meta, svg, src: clean });
  }
}

// ---------- slides ----------
const S = [];            // html strings of top-level <section>s (or vertical stacks)
const notes = t => t ? `<aside class="notes">${esc(t)}</aside>` : '';
const deckTitle = opt('--title', `Defending ${map.repo}`);

S.push(`<section class="title"><h1>${esc(deckTitle)}</h1>
  <p class="sub">${esc(map.root ? 'Why it exists, how it is built, and why each decision holds' : '')}</p>
  <p class="meta">repo ${esc(map.repo)} &nbsp;|&nbsp; map built from ${esc(map.built || 'n/a')} &nbsp;|&nbsp; ${esc(map.date)}</p></section>`);

S.push(`<section><h2>The root problem</h2><div class="big">${inline(map.root)}</div>
  <p class="hint">Everything else follows from this problem.</p></section>`);

S.push(`<section><h2>The ${map.decisions.length} decisions</h2><ol class="agenda">` +
  map.decisions.map(d => `<li class="fragment"><b>${esc(d.id)}</b> ${esc(d.title)}</li>`).join('') + `</ol></section>`);

function diagramSlide(d) {
  const t = d.meta.title || d.file.replace(/\.mmd$/, '').replace(/[-_]/g, ' ');
  const build = /^true$/i.test(d.meta.build || '');
  const body = d.svg
    ? `<div class="diagram${build ? ' build' : ''}">${d.svg}</div>`
    : `<pre class="mermaid-src">${esc(d.src)}</pre>`;
  return `<section data-diagram="${esc(d.file)}"${build ? ' data-build="1"' : ''}><h3>${esc(t)}</h3>${body}` +
    (d.meta.caption ? `<p class="caption">${inline(d.meta.caption)}</p>` : '') + `</section>`;
}
function tableSlide(tb, fname) {
  const stepped = /^frames/.test(fname);
  const head = '<tr>' + tb.head.map(h => `<th>${inline(h)}</th>`).join('') + '</tr>';
  const rows = tb.rows.map(r => `<tr${stepped ? ' class="fragment step"' : ''}>` + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('');
  return `<section><h3>${esc(tb.title || fname)}</h3><table class="data">${head}${rows}</table>` +
    `<p class="caption">${stepped ? 'Press space: one step at a time.' : 'Result of each check.'} Source: ${esc(fname)}</p></section>`;
}

// architecture diagrams (not tied to a decision)
const arch = diagrams.filter(d => !d.meta.decision);
if (arch.length) S.push(`<section><section><h2>The system in pictures</h2><p class="hint">Structure first, then behavior.</p></section>${arch.map(diagramSlide).join('')}</section>`);

for (const d of map.decisions) {
  const f = d.fields, slides = [];
  const logNote = logById[d.id] ? 'YOUR SESSION LOG (private, do not read aloud):\n' + logById[d.id] : '';
  slides.push(`<section><h2><span class="tag">${esc(d.id)}</span> ${esc(d.title)}</h2>
    <div class="card"><h4>Problem</h4><p>${inline(f.problem)}</p></div>
    ${f.given ? `<div class="card fragment"><h4>What exists at this point</h4><p>${inline(f.given)}</p></div>` : ''}${notes(logNote)}</section>`);

  if (intuition[d.id]) slides.push(`<section><h3>${esc(d.id)} in plain words</h3><div class="plain">${intuition[d.id].split(/\n\n+/).map(p => `<p class="fragment">${inline(p)}</p>`).join('')}</div></section>`);

  const cons = parseConstraints(f.constraints);
  if (cons.length) slides.push(`<section><h3>Why the obvious design fails</h3><ol class="cons">` +
    cons.map(c => `<li class="fragment"><span class="rule">${inline(c.rule)}</span>${c.breaks ? `<span class="breaks fragment">breaks: ${inline(c.breaks)}</span>` : ''}</li>`).join('') + `</ol></section>`);

  const opts = parseOptions(f.options);
  if (opts.length) slides.push(`<section><h3>Options considered</h3><table class="data">` +
    `<tr><th>Option</th><th>Trade-off</th></tr>` + opts.map(o => `<tr class="fragment"><td>${inline(o.name)}</td><td>${inline(o.tradeoff)}</td></tr>`).join('') + `</table></section>`);

  const where = d.where.filter(Boolean).map(parseWhere);
  slides.push(`<section><h3>The decision</h3><div class="decision">${inline(f.decision)}</div>` +
    (where.length ? `<h4>Where it lives in the code</h4><table class="where">` + where.map(w => `<tr class="fragment"><td><code>${esc(w.loc)}</code></td><td>${inline(w.role)}</td></tr>`).join('') + `</table>` : '') +
    (f.evidence ? `<p class="caption">Evidence: ${inline(f.evidence)}</p>` : '') + `</section>`);

  diagrams.filter(x => x.meta.decision === d.id).forEach(x => slides.push(diagramSlide(x)));
  for (const tf of tableFiles) {
    const m = tf.match(/\bD(\d+)\b/); if (!m || 'D' + m[1] !== d.id) continue;
    mdTables(read(path.join(notesDir, tf))).forEach(tb => slides.push(tableSlide(tb, tf)));
  }
  S.push(`<section>${slides.join('')}</section>`);
}

// general tables (no decision id in file name)
const generalTables = tableFiles.filter(tf => !/\bD\d+\b/.test(tf));
if (generalTables.length) {
  const sl = [`<section><h2>Checking the model</h2><p class="hint">Walk-through with real values, then tests against a trusted second route.</p></section>`];
  for (const tf of generalTables) mdTables(read(path.join(notesDir, tf))).forEach(tb => sl.push(tableSlide(tb, tf)));
  S.push(`<section>${sl.join('')}</section>`);
}

S.push(`<section><h2>Questions</h2><p class="hint">Press <b>S</b> for speaker notes. Press <b>O</b> for the slide overview. Alt+click zooms. Add <code>?print-pdf</code> to the address to print a handout.</p></section>`);

// ---------- assemble single file ----------
const rv = p => fs.readFileSync(path.join(here, 'node_modules', 'reveal.js', p), 'utf8');
let revealCss, resetCss, revealJs, notesJs, zoomJs;
try { revealCss = rv('dist/reveal.css'); resetCss = rv('dist/reset.css'); revealJs = rv('dist/reveal.js'); notesJs = rv('plugin/notes/notes.js'); zoomJs = rv('plugin/zoom/zoom.js'); }
catch (e) { console.error('reveal.js not found. Run: npm install reveal.js (in ' + here + ')'); process.exit(1); }
const safeJs = s => s.replace(/<\/script/gi, '<\\/script').replace(/^\/\/# sourceMappingURL=.*$/gm, '');

const css = `
:root{--ink:#1a2230;--navy:#1d3f72;--accent:#1d4f91;--soft:#e4edf8;--warn:#9a5b00;--bad:#a4262c;--line:#c5ccd8;--grey:#566074}
.reveal{font-family:"Segoe UI",Inter,Helvetica,Arial,sans-serif;font-size:30px;color:var(--ink)}
.reveal-viewport{background:#fff}
.reveal h1,.reveal h2,.reveal h3,.reveal h4{font-family:inherit;color:var(--navy);text-transform:none;letter-spacing:0;margin:0 0 .5em}
.reveal h1{font-size:2.1em}.reveal h2{font-size:1.5em}.reveal h3{font-size:1.15em}.reveal h4{font-size:.7em;text-transform:uppercase;letter-spacing:.08em;color:var(--grey);margin:.4em 0 .2em}
.reveal section{text-align:left}
.reveal section.title{text-align:center}
.sub{color:var(--grey);margin:.2em 0 1.2em}.meta{display:block;font-family:Consolas,monospace;font-size:.5em;color:var(--grey)}
.hint,.caption{color:var(--grey);font-size:.6em}
.big{font-size:1.25em;line-height:1.4;border-left:8px solid var(--accent);padding:.3em .8em;background:var(--soft)}
.tag{background:var(--navy);color:#fff;border-radius:6px;padding:.05em .4em;font-size:.75em;margin-right:.3em}
.card{background:var(--soft);border-left:6px solid var(--accent);padding:.4em .9em;margin:.5em 0;font-size:.85em}
.card p{margin:.2em 0}
.agenda{list-style:none;padding:0;margin:0}.agenda li{margin:.35em 0}.agenda b{color:var(--accent)}
.cons{list-style:none;padding:0;margin:0}.cons li{margin:.5em 0;padding:.4em .8em;border:1px solid var(--line);border-radius:6px;font-size:.8em}
.cons .rule{display:block;font-weight:600}.cons .breaks{display:block;color:var(--bad);margin-top:.2em}
table.data,table.where{width:100%;border-collapse:collapse;font-size:.68em}
table.data th{background:var(--soft);text-align:left}
table.data td,table.data th,table.where td{border:1px solid var(--line);padding:.35em .6em;vertical-align:top}
table.data tr.step.current-fragment{background:#fff3c4}
table.where td:first-child{white-space:nowrap}
.decision{font-size:.95em;background:var(--soft);border-left:8px solid var(--navy);padding:.5em .9em;margin-bottom:.6em}
.plain p{font-size:.9em;line-height:1.45}
code{font-family:Consolas,Menlo,monospace;font-size:.82em;background:#eef1f5;padding:.05em .3em;border-radius:3px}
.diagram{background:#fff;border:1px solid var(--line);border-radius:8px;padding:.4em;text-align:center}
.diagram svg{max-width:none!important;width:100%;height:auto;max-height:520px}
.diagram.build .gone{opacity:0;transition:opacity .35s}.diagram.build .shown{opacity:1}
pre.mermaid-src{font-size:.45em;background:#eef1f5;padding:1em}
aside.notes{display:none}
`;

// build-step script: reveal flowchart/state nodes (then their edges) one step at a time
const runtime = `
(function(){
  function setup(section){
    var svg=section.querySelector('.diagram.build svg'); if(!svg||section._built) return; section._built=true;
    var nodes=[].slice.call(svg.querySelectorAll('g.node, g.cluster, g.statediagram-state'));
    var edges=[].slice.call(svg.querySelectorAll('g.edgePaths path, path.transition, g.edgePath path'));
    var labels=[].slice.call(svg.querySelectorAll('g.edgeLabels g.label, g.edgeLabel'));
    var steps=[];
    nodes.forEach(function(n){steps.push([n]);});
    var all=edges.concat(labels);
    // attach each edge to the step where both ends exist (match by ids L_<a>_<b>_n); else last step
    var byId={}; nodes.forEach(function(n,i){var m=(n.id||'').match(/^(?:flowchart|state)-(.+?)-\\d+$/); if(m) byId[m[1]]=i;});
    all.forEach(function(e){
      var m=(e.id||'').match(/^L[_-](.+)[_-](.+)[_-]\\d+$/), idx=steps.length-1;
      if(m){var a=byId[m[1]],b=byId[m[2]]; if(a!==undefined&&b!==undefined) idx=Math.max(a,b);}
      if(idx>=0) steps[idx].push(e);
    });
    steps.forEach(function(g){g.forEach(function(el){el.classList.add('gone');});});
    section._steps=steps; section._shown=0;
    // add invisible fragments so Reveal paces the build
    var holder=document.createElement('div'); holder.style.height='0'; holder.className='build-holder';
    steps.forEach(function(g,i){var s=document.createElement('span'); s.className='fragment'; s.setAttribute('data-build-step',i); holder.appendChild(s);});
    section.appendChild(holder);
  }
  function apply(section,upto){
    if(!section._steps) return;
    section._steps.forEach(function(g,i){g.forEach(function(el){el.classList.toggle('gone',i>upto); el.classList.toggle('shown',i<=upto);});});
  }
  function currentSection(){return Reveal.getCurrentSlide();}
  Reveal.on('ready',function(){document.querySelectorAll('section[data-build]').forEach(setup);});
  Reveal.on('slidechanged',function(e){setup(e.currentSlide); if(e.currentSlide._steps) apply(e.currentSlide,-1);});
  Reveal.on('fragmentshown',function(e){var s=e.fragment.getAttribute('data-build-step'); if(s!==null) apply(currentSection(),+s);});
  Reveal.on('fragmenthidden',function(e){var s=e.fragment.getAttribute('data-build-step'); if(s!==null) apply(currentSection(),+s-1);});
})();`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(deckTitle)}</title>
<style>${resetCss}</style><style>${revealCss}</style><style>${css}</style></head>
<body><div class="reveal"><div class="slides">${S.join('\n')}</div></div>
<script>${safeJs(revealJs)}</script>
<script>${safeJs(notesJs)}</script>
<script>${safeJs(zoomJs)}</script>
<script>Reveal.initialize({width:1280,height:720,margin:0.04,hash:true,controls:true,progress:true,slideNumber:'c/t',transition:'fade',plugins:[RevealNotes,RevealZoom]});${runtime}</script>
</body></html>`;

const out = opt('--out', path.join(projectDir, 'deck', 'index.html'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`OK ${out}  (${(html.length / 1024).toFixed(0)} KB, ${map.decisions.length} decisions, ${diagrams.length} diagrams)`);
const missing = diagrams.filter(d => !d.svg).length; if (missing) warn(missing + ' diagram(s) could not be rendered; Mermaid source shown instead.');
