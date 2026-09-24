/**
 * app.js — wires the page to the engine. Every control on the page does
 * something; user text only ever reaches the DOM through textContent or
 * escapeHtml().
 */
import { analyze, rewrite, diffWords, escapeHtml, words, RULES, CATEGORIES } from './engine.js';

const $ = (id) => document.getElementById(id);
const input = $('inputText'), output = $('outputText');
const MODES = {
  humanize: { label: 'Humanize text', hint: 'Removes filler, stock phrases and stacked transitions. Strength decides how much it touches.' },
  paraphrase: { label: 'Use plain words', hint: 'Humanize, plus formal words swapped for plain ones ("utilize" → "use", "prior to" → "before").' },
  shorten: { label: 'Shorten text', hint: 'Cuts padding, intensifiers ("really", "very") and redundant pairs. Never deletes whole clauses.' },
  expand: { label: 'Add expand prompts', hint: 'Marks vague claims with a prompt for the detail that would make them concrete. It never invents facts.' },
  grammar: { label: 'Fix grammar', hint: 'Fixes lowercase "i", repeated words, a/an, stray spaces and common misspellings.' },
};
const SAMPLE = 'In conclusion, it is important to note that artificial intelligence has become an increasingly significant part of our everyday lives. Furthermore, it is essential that we consider the various ways in which this technology can impact society in the future. Moreover, organizations must leverage robust, cutting-edge solutions in order to navigate the complexities of this rapidly evolving landscape.';

const state = { mode: 'humanize', level: 'light', last: null };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------------------------------------------------------------- controls ---
function updateCount() { $('inputCount').textContent = `${words(input.value).toLocaleString()} words`; }
input.addEventListener('input', () => { updateCount(); scheduleAnalysis(); });

document.querySelectorAll('.feature-tab').forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.feature-tab').forEach((t) => { const on = t.dataset.mode === mode; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
  $('actionLabel').textContent = MODES[mode].label;
  $('modeHint').textContent = MODES[mode].hint;
  // Strength and creativity only mean something for the rewriting modes.
  const tunable = mode === 'humanize' || mode === 'paraphrase';
  document.querySelectorAll('.level-btn, #creativity, #style').forEach((el) => { el.disabled = !tunable && el.id !== 'style'; });
  store.set('derobo.mode', mode);
}

document.querySelectorAll('.level-btn').forEach((b) => b.addEventListener('click', () => {
  state.level = b.dataset.level;
  document.querySelectorAll('.level-btn').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); });
  store.set('derobo.level', state.level);
}));

const creativity = $('creativity');
function creativityLabel() { const v = Number(creativity.value); $('creativityValue').textContent = v < 34 ? 'Conservative' : v >= 67 ? 'Creative' : 'Balanced'; }
creativity.addEventListener('input', creativityLabel);

$('clearBtn').addEventListener('click', () => {
  input.value = ''; updateCount(); resetOutput(); $('report').hidden = true; input.focus();
});
$('sampleBtn').addEventListener('click', () => { input.value = SAMPLE; updateCount(); runAnalysis(); input.focus(); });
$('pasteBtn').addEventListener('click', async () => {
  try { input.value = await navigator.clipboard.readText(); updateCount(); runAnalysis(); }
  catch { input.focus(); toast('Clipboard access was blocked — press ⌘/Ctrl+V instead.'); }
});

function resetOutput() {
  output.textContent = 'Your rewritten text will appear here.';
  output.className = 'output-placeholder';
  $('outputCount').textContent = '0 words';
  $('copyBtn').disabled = true;
  state.last = null;
}

// ------------------------------------------------------------------ rewrite ---
function options() {
  return {
    mode: state.mode, level: state.level, style: $('style').value, creativity: Number(creativity.value),
    preserve: $('preserveTerms').checked,
    terms: $('termsInput').value.split(',').map((t) => t.trim()).filter(Boolean),
  };
}

function run() {
  const text = input.value;
  if (!text.trim()) { input.focus(); toast('Paste some text first.'); return; }
  const result = rewrite(text, options());
  state.last = { input: text, output: result.text, changes: result.changes, mode: state.mode };
  renderOutput();
  renderReport(text, result.text);
  addHistory(result.text);
  toast(result.changes.length ? `${result.changes.length} change${result.changes.length === 1 ? '' : 's'} made.` : 'Nothing to change at this setting — try a higher strength.');
}
$('humanizeBtn').addEventListener('click', run);
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } });

function renderOutput() {
  const last = state.last;
  if (!last) return;
  output.className = 'output-placeholder ready';
  if ($('showChanges').checked) {
    output.innerHTML = diffWords(last.input, last.output).map((p) =>
      p.type === 'same' ? escapeHtml(p.text) : p.type === 'add' ? `<ins>${escapeHtml(p.text)}</ins>` : `<del>${escapeHtml(p.text)}</del>`).join('');
  } else {
    output.textContent = last.output;
  }
  $('outputCount').textContent = `${words(last.output).toLocaleString()} words`;
  $('copyBtn').disabled = false;
}
$('showChanges').addEventListener('change', renderOutput);

$('copyBtn').addEventListener('click', async () => {
  if (!state.last) return;
  try { await navigator.clipboard.writeText(state.last.output); $('copyBtn').textContent = 'Copied ✓'; }
  catch { toast('Copy was blocked — select the text and copy it manually.'); }
  setTimeout(() => { $('copyBtn').textContent = 'Copy text'; }, 1500);
});

// ------------------------------------------------------------------- report ---
let timer = null;
function scheduleAnalysis() { clearTimeout(timer); timer = setTimeout(runAnalysis, 350); }
function runAnalysis() { if (input.value.trim()) renderReport(input.value, state.last?.input === input.value ? state.last.output : null); else $('report').hidden = true; }

function renderReport(before, after) {
  const a = analyze(before);
  $('report').hidden = false;
  setGauge('gaugeBefore', a.score);
  if (after != null) setGauge('gaugeAfter', analyze(after).score); else setGauge('gaugeAfter', null);
  $('scoreLabel').textContent = after != null ? `${a.label} → ${analyze(after).label}` : a.label;

  // Input with every finding highlighted (positions come from the engine).
  let html = '', at = 0;
  for (const f of a.findings) {
    if (f.start < at) continue;                       // overlapping rules: first wins
    html += escapeHtml(before.slice(at, f.start));
    html += `<mark class="cat-${f.category}" title="${escapeHtml(f.why)}${f.suggestion ? ` Try: ${escapeHtml(f.suggestion)}` : ''}">${escapeHtml(f.match)}</mark>`;
    at = f.end;
  }
  html += escapeHtml(before.slice(at));
  $('marked').innerHTML = html || '<span class="muted">Nothing flagged.</span>';

  $('categories').innerHTML = Object.entries(a.byCategory).map(([k, n]) => `<span class="chip cat-${k}">${escapeHtml(CATEGORIES[k])} · ${n}</span>`).join('')
    || '<span class="muted small">No stock phrases found.</span>';
  const seen = new Set();
  $('findings').innerHTML = a.findings.filter((f) => !seen.has(f.ruleId) && seen.add(f.ruleId)).slice(0, 8).map((f) =>
    `<li><q>${escapeHtml(f.match.trim().replace(/,$/, ''))}</q> <span class="muted">— ${escapeHtml(f.why)}</span>${f.suggestion ? ` <span class="try">Try: ${escapeHtml(f.suggestion)}</span>` : ''}</li>`).join('');
  const s = a.stats;
  $('stats').innerHTML = [
    ['Sentences', s.sentences], ['Avg. sentence', `${s.avgSentence} words`],
    ['Length variety', s.sentences > 3 ? (s.sentenceSpread < 4 ? `${s.sentenceSpread} (flat)` : `${s.sentenceSpread}`) : '—'],
    ['Repeated openers', s.repeatedStarts], ['Passive phrases', s.passive],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join('');
}

function setGauge(id, score) {
  const el = $(id);
  el.querySelector('.gauge-num').textContent = score == null ? '—' : String(score);
  el.style.setProperty('--p', score == null ? 0 : score);
  el.dataset.band = score == null ? '' : score < 25 ? 'good' : score < 50 ? 'ok' : 'bad';
}

// ------------------------------------------------------------------ history ---
let history = store.get('derobo.history', []);
if (!Array.isArray(history)) history = [];
function addHistory(text) {
  history.unshift({ mode: state.mode, text, time: new Date().toISOString() });
  history = history.slice(0, 10);
  store.set('derobo.history', history);
  renderHistory();
}
function renderHistory() {
  $('historyList').innerHTML = history.length ? history.map((h, i) =>
    `<button class="history-item" type="button" data-i="${i}"><b>${escapeHtml(MODES[h.mode]?.label || h.mode)}</b><span>${escapeHtml(h.text.slice(0, 90))}${h.text.length > 90 ? '…' : ''}</span><small>${escapeHtml(new Date(h.time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</small></button>`).join('')
    : '<p class="empty-history">Your recent drafts will show up here.</p>';
}
$('historyList').addEventListener('click', (e) => {
  const item = e.target.closest('.history-item');
  if (!item) return;
  const h = history[Number(item.dataset.i)];
  state.last = { input: h.text, output: h.text, changes: [], mode: h.mode };
  output.textContent = h.text; output.className = 'output-placeholder ready';
  $('outputCount').textContent = `${words(h.text)} words`; $('copyBtn').disabled = false;
});
$('historyBtn').addEventListener('click', () => {
  const panel = $('historyPanel'); panel.hidden = !panel.hidden;
  $('historyBtn').setAttribute('aria-expanded', String(!panel.hidden)); renderHistory();
});
$('closeHistory').addEventListener('click', () => { $('historyPanel').hidden = true; $('historyBtn').setAttribute('aria-expanded', 'false'); });
$('clearHistory').addEventListener('click', () => { history = []; store.set('derobo.history', history); renderHistory(); });

// -------------------------------------------------------------------- theme ---
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('themeBtn').textContent = dark ? '☼' : '☾';
  $('themeBtn').setAttribute('aria-pressed', String(dark));
  $('themeBtn').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}
$('themeBtn').addEventListener('click', () => { const dark = document.documentElement.dataset.theme !== 'dark'; setTheme(dark); store.set('derobo.dark', dark); });

// -------------------------------------------------------------------- rules ---
$('ruleList').innerHTML = Object.entries(CATEGORIES).map(([cat, name]) => {
  const items = RULES.filter((r) => r.category === cat);
  return `<div class="rule-card"><h3><span class="dot cat-${cat}"></span>${escapeHtml(name)}</h3><p class="muted small">${items.length} patterns, e.g. ${items.slice(0, 3).map((r) => `<code>${escapeHtml(r.id.replace(/-/g, ' '))}</code>`).join(', ')}</p></div>`;
}).join('');

// -------------------------------------------------------------------- toast ---
let toastEl;
function toast(msg) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastEl.t); toastEl.t = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// --------------------------------------------------------------------- init ---
const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;
setTheme(store.get('derobo.dark', !!prefersDark));
setMode(MODES[store.get('derobo.mode', 'humanize')] ? store.get('derobo.mode', 'humanize') : 'humanize');
const savedLevel = store.get('derobo.level', 'light');
document.querySelector(`.level-btn[data-level="${['light', 'balanced', 'deep'].includes(savedLevel) ? savedLevel : 'light'}"]`)?.click();
creativityLabel(); updateCount(); renderHistory();
