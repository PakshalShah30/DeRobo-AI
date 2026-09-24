import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, rewrite, diffWords, protect, escapeHtml, words, RULES } from '../src/engine.js';

const SAMPLE = 'In conclusion, it is important to note that artificial intelligence has become an increasingly significant part of our everyday lives. Furthermore, it is essential that we consider the various ways in which this technology can impact society in the future.';

test('the old sample gets flagged and cleaned', () => {
  const before = analyze(SAMPLE);
  assert.ok(before.score >= 40, `score ${before.score}`);
  assert.ok(before.findings.some((f) => f.ruleId === 'important-to-note'));
  const out = rewrite(SAMPLE, { level: 'balanced' }).text;
  assert.equal(out, "Artificial intelligence has become an important part of our everyday lives. Also, we should consider how this technology can impact society in the future.");
  assert.ok(analyze(out).score < before.score);
});

test('stacked transitions do not become stacked "Also,"', () => {
  const out = rewrite('We ship. Furthermore, we test. Moreover, we measure.', { level: 'balanced' }).text;
  assert.equal(out, 'We ship. Also, we test. We measure.');
});

test('findings carry exact positions for highlighting', () => {
  const text = 'We should leverage synergies in order to win.';
  for (const f of analyze(text).findings) assert.equal(text.slice(f.start, f.end), f.match);
  assert.deepEqual(analyze(text).findings.map((f) => f.ruleId), ['leverage', 'in-order-to']);
});

test('levels are different: light < balanced < deep', () => {
  const t = 'We leverage robust tools. Moreover, when it comes to speed, we win.';
  const light = rewrite(t, { level: 'light' }).text;
  const balanced = rewrite(t, { level: 'balanced' }).text;
  assert.equal(light, t);                                      // light leaves buzzwords alone
  assert.equal(balanced, 'We use strong tools. Also, for speed, we win.');
});

test('styles are different: casual contracts, academic stays formal', () => {
  const t = 'It is clear that we do not need it. Furthermore, they are ready.';
  assert.match(rewrite(t, { style: 'casual', level: 'balanced' }).text, /It's clear that we don't need it\. Also, they're ready\./);
  assert.equal(rewrite(t, { style: 'academic', level: 'balanced' }).text, t);
  assert.match(rewrite('I think this works. It is fast.', { style: 'persuasive', level: 'deep' }).text, /^This works\./);
});

test('shorten removes padding but never deletes clauses', () => {
  const t = 'The team, which shipped the feature, was really very quick, and each and every user noticed the end result.';
  const out = rewrite(t, { mode: 'shorten' }).text;
  assert.equal(out, 'The team, which shipped the feature, was quick, and every user noticed the result.');
});

test('expand adds prompts, never invented content', () => {
  const out = rewrite('Our changes significantly improved the onboarding flow for users. It shipped in May.', { mode: 'expand' }).text;
  assert.equal(out, 'Our changes significantly improved the onboarding flow for users [add a number: how much?]. It shipped in May.');
  assert.ok(!/This is an important consideration/.test(out));
});

test('grammar mode fixes common slips', () => {
  const out = rewrite('i think this is is a apple , and alot of people agree!!', { mode: 'grammar' }).text;
  assert.equal(out, 'I think this is an apple, and a lot of people agree!');
});

test('preserve terms keeps numbers, quotes, links and user terms untouched', () => {
  const t = 'We utilize "in order to" at https://example.com/in-order-to and saw 38% growth. Utilize FooBar.';
  const out = rewrite(t, { level: 'balanced', terms: ['Utilize FooBar'] }).text;
  assert.equal(out, 'We use "in order to" at https://example.com/in-order-to and saw 38% growth. Utilize FooBar.');
  // off: the quote is fair game
  assert.match(rewrite('Say "in order to" now.', { preserve: false }).text, /"to"/);
});

test('protect placeholders survive other patterns (numbers inside placeholders)', () => {
  const p = protect('A "quoted 1" then 22 and NASA and 3.5% and `code 9`', ['then']);
  assert.equal(p.restore(p.text), 'A "quoted 1" then 22 and NASA and 3.5% and `code 9`');
  assert.equal(p.spans.length, 6);
});

test('paraphrase swaps formal words for plain ones, keeping case', () => {
  assert.equal(rewrite('Numerous individuals utilize it prior to launch.', { mode: 'paraphrase' }).text, 'Many people use it before launch.');
});

test('deep + creative splits very long sentences', () => {
  const long = 'We rebuilt the reporting pipeline for the finance team over three quarters and moved every nightly job to the new scheduler; the old cron boxes were retired and the on-call load dropped for everyone involved in the process.';
  const out = rewrite(long, { level: 'deep', creativity: 80, preserve: false }).text;
  assert.equal(out.split('. ').length, 2);
  assert.match(out, /scheduler\. The old cron boxes/);
});

test('human-sounding text scores low', () => {
  const t = "I moved the nightly jobs off our old cron box last spring. It took a week. Nobody noticed, which was the point — the reports kept arriving at 6 a.m. and the pager stayed quiet.";
  assert.ok(analyze(t).score < 25, `score ${analyze(t).score}`);
});

test('diff marks only what changed', () => {
  const d = diffWords('we utilize tools', 'we use tools');
  assert.deepEqual(d.filter((x) => x.type !== 'same').map((x) => [x.type, x.text]), [['del', 'utilize'], ['add', 'use']]);
});

test('escapeHtml neutralises markup (history panel XSS)', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('every rule is well formed', () => {
  const ids = new Set();
  for (const r of RULES) {
    assert.ok(r.re.global, `${r.id} must be global`);
    assert.ok(!ids.has(r.id), `duplicate ${r.id}`); ids.add(r.id);
    assert.ok(['light', 'balanced', 'deep'].includes(r.level), r.id);
    assert.ok(r.why, r.id);
  }
  assert.equal(words('  one two\nthree '), 3);
});
