/**
 * engine.js — DeRobo's text engine. Pure functions, no DOM, so it runs in the
 * browser and in Node's test runner unchanged.
 *
 *   analyze(text)            → robo-speak score, findings with positions, stats
 *   rewrite(text, options)   → { text, changes } for each mode
 *   diffWords(a, b)          → word-level diff for "Highlight changes"
 *
 * Everything is rule-based and deterministic: the same input and settings give
 * the same output. The score is a *style* heuristic (stock phrases, filler,
 * monotonous rhythm). It is not an AI detector and must never be presented as one.
 */

// ------------------------------------------------------------------ rules ---
// Each rule: id, category, regex (global, case-insensitive unless noted),
// replacement (string | function | null = flag only), why (shown to the user),
// level: the lowest humanize level that applies it ("light" | "balanced" | "deep").

export const CATEGORIES = {
  filler: 'Filler & throat-clearing',
  wordy: 'Wordy phrasing',
  buzzword: 'Buzzwords & stock AI phrases',
  transition: 'Stacked transitions',
  hedge: 'Hedging',
  redundancy: 'Redundancy',
};

const W = (s) => new RegExp(`\\b${s}\\b`, 'gi');

export const RULES = [
  // --- filler / throat-clearing: remove the preamble, keep the claim
  { id: 'important-to-note', category: 'filler', re: W('it is (?:important|worth|crucial|essential) to (?:note|mention|remember|highlight) that'), to: '', level: 'light', why: 'Announces a point instead of making it.' },
  { id: 'should-be-noted', category: 'filler', re: W('it should be noted that'), to: '', level: 'light', why: 'Announces a point instead of making it.' },
  { id: 'needless-to-say', category: 'filler', re: W('needless to say,?'), to: '', level: 'light', why: 'If it is needless to say, skip it.' },
  { id: 'fast-paced-world', category: 'buzzword', re: W("in today'?s (?:fast-paced|ever-changing|rapidly evolving|digital|modern) (?:world|landscape|age|era),?"), to: 'today,', level: 'light', why: 'A stock opener that says nothing.' },
  { id: 'when-it-comes-to', category: 'wordy', re: W('when it comes to'), to: 'for', level: 'balanced', why: 'Four words where one works.' },
  { id: 'the-fact-that', category: 'wordy', re: W('due to the fact that'), to: 'because', level: 'light', why: 'Wordy.' },
  { id: 'in-order-to', category: 'wordy', re: W('in order to'), to: 'to', level: 'light', why: 'Wordy.' },
  { id: 'at-this-point', category: 'wordy', re: W('at this point in time'), to: 'now', level: 'light', why: 'Wordy.' },
  { id: 'has-the-ability', category: 'wordy', re: W('(?:has|have) the ability to'), to: (m) => (/^have/i.test(m) ? 'can' : 'can'), level: 'light', why: 'Wordy.' },
  { id: 'for-the-purpose', category: 'wordy', re: W('for the purpose of'), to: 'for', level: 'light', why: 'Wordy.' },
  { id: 'a-number-of', category: 'wordy', re: W('(?:there are )?a (?:large )?number of'), to: (m) => (/^there/i.test(m) ? 'there are many' : 'many'), level: 'balanced', why: 'Vague and wordy.' },
  { id: 'in-the-event', category: 'wordy', re: W('in the event that'), to: 'if', level: 'light', why: 'Wordy.' },
  { id: 'with-regard-to', category: 'wordy', re: W('with (?:regard|respect) to'), to: 'about', level: 'balanced', why: 'Wordy.' },
  { id: 'various-ways', category: 'wordy', re: W('the various ways in which'), to: 'how', level: 'light', why: 'Wordy.' },
  { id: 'essential-that-we', category: 'wordy', re: W('it is (?:essential|important|crucial|vital) that we'), to: 'we should', level: 'balanced', why: 'Distances the reader from the point.' },

  // --- stock "AI voice" phrases
  { id: 'delve', category: 'buzzword', re: W('delv(?:e|es|ing) (?:into|deeper into)'), to: (m) => (/ing/i.test(m) ? 'looking at' : /es/i.test(m) ? 'looks at' : 'look at'), level: 'light', why: 'A tell-tale stock phrase.' },
  { id: 'tapestry', category: 'buzzword', re: W('(?:a )?rich tapestry of'), to: 'a mix of', level: 'light', why: 'A tell-tale stock phrase.' },
  { id: 'testament', category: 'buzzword', re: W('(?:is|stands as) a testament to'), to: 'shows', level: 'light', why: 'A tell-tale stock phrase.' },
  { id: 'crucial-role', category: 'buzzword', re: W('plays? an? (?:crucial|pivotal|vital|key|significant) role in'), to: (m) => (/^plays/i.test(m) ? 'matters for' : 'matter for'), level: 'balanced', why: 'Inflated; say what it does.' },
  { id: 'navigate-complexities', category: 'buzzword', re: W('navigat(?:e|ing) the (?:complexities|intricacies) of'), to: (m) => (/ing/i.test(m) ? 'handling' : 'handle'), level: 'light', why: 'A tell-tale stock phrase.' },
  { id: 'leverage', category: 'buzzword', re: W('leverag(?:e|es|ed|ing)'), to: (m) => ({ leverage: 'use', leverages: 'uses', leveraged: 'used', leveraging: 'using' })[m.toLowerCase()], level: 'balanced', why: 'Jargon for "use".' },
  { id: 'utilize', category: 'buzzword', re: W('utiliz(?:e|es|ed|ing|ation)'), to: (m) => ({ utilize: 'use', utilizes: 'uses', utilized: 'used', utilizing: 'using', utilization: 'use' })[m.toLowerCase()], level: 'light', why: 'Jargon for "use".' },
  { id: 'seamless', category: 'buzzword', re: W('seamless(?:ly)?'), to: null, level: 'balanced', why: 'Marketing filler; say what actually works.' },
  { id: 'robust', category: 'buzzword', re: W('robust'), to: 'strong', level: 'balanced', why: 'Overused.' },
  { id: 'cutting-edge', category: 'buzzword', re: W('cutting-edge|state-of-the-art|groundbreaking|game-chang(?:er|ing)'), to: null, level: 'balanced', why: 'Hype word; name the specific advantage.' },
  { id: 'increasingly-significant', category: 'buzzword', re: W('(?:an )?increasingly (?:significant|important)'), to: (m) => (/^an/i.test(m) ? 'an important' : 'important'), level: 'light', why: 'Inflated.' },
  { id: 'unlock-potential', category: 'buzzword', re: W('unlock(?:s|ing)? (?:the )?(?:full )?potential of'), to: 'get more from', level: 'balanced', why: 'A tell-tale stock phrase.' },
  { id: 'landscape', category: 'buzzword', re: W('the (?:ever-evolving |evolving |changing |current )?landscape of'), to: '', level: 'deep', why: 'Stock framing.' },

  // --- transitions: stacked "Furthermore / Moreover / Additionally" at sentence start
  { id: 'in-conclusion', category: 'transition', re: /(^|[.!?]\s+)(?:In conclusion|To conclude|In summary|Overall),\s*/g, to: '$1', level: 'light', why: 'Readers know it is the end.' },
  { id: 'furthermore', category: 'transition', re: /(^|[.!?]\s+)(?:Furthermore|Moreover|Additionally|In addition),\s*/g, to: (m, lead) => `${lead}Also, `, level: 'balanced', why: 'Stacked formal transitions read as generated.' },
  { id: 'that-being-said', category: 'transition', re: /(^|[.!?]\s+)(?:That being said|With that being said|Having said that),\s*/g, to: '$1Still, ', level: 'balanced', why: 'Wordy transition.' },

  // --- hedging
  { id: 'may-potentially', category: 'hedge', re: W('(?:may|might|could) potentially'), to: (m) => m.split(/\s+/)[0], level: 'light', why: 'Double hedge.' },
  { id: 'i-think', category: 'hedge', re: /(^|[.!?]\s+)(?:I think|I believe|I feel|In my opinion),?\s+/g, to: '$1', level: 'deep', persuasiveOnly: true, why: 'Weakens a claim you are making anyway.' },

  // --- redundancy (used by Shorten at every level)
  { id: 'each-and-every', category: 'redundancy', re: W('each and every'), to: 'every', level: 'light', why: 'Redundant pair.' },
  { id: 'first-and-foremost', category: 'redundancy', re: W('first and foremost'), to: 'first', level: 'light', why: 'Redundant pair.' },
  { id: 'end-result', category: 'redundancy', re: W('end result'), to: 'result', level: 'light', why: 'Redundant.' },
  { id: 'past-history', category: 'redundancy', re: W('past history'), to: 'history', level: 'light', why: 'Redundant.' },
  { id: 'future-plans', category: 'redundancy', re: W('future plans'), to: 'plans', level: 'light', why: 'Redundant.' },
  { id: 'absolutely-essential', category: 'redundancy', re: W('absolutely (?:essential|necessary|critical)'), to: (m) => m.split(/\s+/)[1], level: 'light', why: 'Redundant intensifier.' },
  { id: 'completely-eliminate', category: 'redundancy', re: W('completely (?:eliminate|finish|destroy)'), to: (m) => m.split(/\s+/)[1], level: 'light', why: 'Redundant intensifier.' },
];

const LEVELS = { light: 0, balanced: 1, deep: 2 };

// Formal → plain word swaps (Paraphrase, and Humanize at "creative").
const PLAIN = {
  commence: 'start', commenced: 'started', commences: 'starts', facilitate: 'help', facilitates: 'helps', facilitated: 'helped',
  numerous: 'many', approximately: 'about', demonstrate: 'show', demonstrates: 'shows', demonstrated: 'showed',
  individuals: 'people', purchase: 'buy', purchased: 'bought', assist: 'help', assists: 'helps', assisted: 'helped',
  obtain: 'get', obtained: 'got', sufficient: 'enough', subsequently: 'later', endeavor: 'try', endeavour: 'try',
  ascertain: 'find out', additionally: 'also', consequently: 'so', nevertheless: 'still', regarding: 'about',
  'prior to': 'before', 'in excess of': 'more than', 'a majority of': 'most', 'in close proximity to': 'near',
};

// Contractions for Natural / Casual styles (never Academic).
const CONTRACT = [
  [/\b(it|that|there|what|who) is\b/gi, "$1's"], [/\bdo not\b/gi, "don't"], [/\bdoes not\b/gi, "doesn't"],
  [/\bdid not\b/gi, "didn't"], [/\bis not\b/gi, "isn't"], [/\bare not\b/gi, "aren't"], [/\bcannot\b/gi, "can't"],
  [/\bwill not\b/gi, "won't"], [/\bwe are\b/gi, "we're"], [/\byou are\b/gi, "you're"], [/\bthey are\b/gi, "they're"],
  [/\bI am\b/g, "I'm"], [/\bwe will\b/gi, "we'll"], [/\byou will\b/gi, "you'll"], [/\blet us\b/gi, "let's"],
];

const INTENSIFIERS = /\b(?:very|really|quite|basically|actually|literally|totally|extremely|truly|simply)\s+(?=[a-z])/gi;

// ------------------------------------------------------------- utilities ---

export function words(text) {
  const t = String(text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

export function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
}

/** HTML-escape for anything user-supplied that ends up in innerHTML. */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ----------------------------------------------------- protected spans ---
// "Preserve important terms": URLs, emails, numbers with units, quoted text,
// code, ALL-CAPS / CamelCase terms and the user's own list are swapped for
// placeholders before any rule runs, then restored. Rules can't touch them.
const PH_OPEN = '\uE000', PH_CLOSE = '\uE001';

export function protect(text, userTerms = [], auto = true) {
  const spans = [];
  const patterns = [];
  const terms = userTerms.map((t) => t.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  if (terms.length) patterns.push(new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi'));
  if (auto) {
    patterns.push(
      /https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.]+/g,          // links, emails
      /`[^`]+`/g,                                                // code
      /"[^"\n]{1,200}"|“[^”\n]{1,200}”/g,                         // quotations stay verbatim
      /[$€£]?\d[\d,.]*(?:%|[kKmMbB]\b)?/g,                        // numbers, money, %
      /\b[A-Z]{2,}\d*\b|\b[A-Z][a-z]+[A-Z][A-Za-z]+\b/g,          // NASA, iPhone-style CamelCase
    );
  }
  let out = text;
  for (const re of patterns) {
    out = out.replace(re, (m) => {
      if (m.includes(PH_OPEN)) return m;
      spans.push(m);
      // The index is written in private-use characters, never digits or
      // letters, so later patterns (numbers, ALL-CAPS) can't match inside it.
      return `${PH_OPEN}${String.fromCharCode(0xE100 + spans.length - 1)}${PH_CLOSE}`;
    });
  }
  return { text: out, restore: (s) => s.replace(/\uE000([\uE100-\uEFFF])\uE001/g, (_, c) => spans[c.charCodeAt(0) - 0xE100]), spans };
}

// ---------------------------------------------------------------- analyze ---

/**
 * Robo-speak score (0 = reads human, 100 = reads like a template) plus every
 * flagged phrase with its position, so the UI can highlight it.
 */
export function analyze(text) {
  const src = String(text || '');
  const findings = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(src))) {
      const lead = m[1] && rule.re.source.startsWith('(^|') ? m[1].length : 0;
      const start = m.index + lead;
      const match = m[0].slice(lead);
      if (!match.trim()) { if (m[0].length === 0) rule.re.lastIndex++; continue; }
      const replacement = rule.to === null ? null
        : typeof rule.to === 'function' ? rule.to(m[0], ...m.slice(1)).slice(lead) : rule.to.replace('$1', '');
      findings.push({ start, end: start + match.length, match, ruleId: rule.id, category: rule.category,
        why: rule.why, suggestion: replacement === null ? null : replacement.trim() || '(remove)' });
    }
  }
  findings.sort((a, b) => a.start - b.start);

  const sents = sentences(src);
  const lens = sents.map(words);
  const n = words(src);
  const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const sd = lens.length > 1 ? Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length) : 0;
  const starts = sents.map((s) => s.split(/\s+/)[0].toLowerCase().replace(/[^a-z']/g, ''));
  const repeatedStarts = starts.length - new Set(starts).size;
  const passive = (src.match(/\b(?:is|are|was|were|been|being|be)\s+\w+ed\b/gi) || []).length;

  // Components, each 0..1, then weighted. Density is per 100 words so length
  // doesn't inflate the score.
  const density = n ? findings.length / (n / 100) : 0;
  const phraseC = Math.min(1, density / 6);
  const rhythmC = lens.length >= 4 ? Math.max(0, Math.min(1, (6 - sd) / 6)) : 0;       // monotonous sentence length
  const startC = sents.length >= 3 ? Math.min(1, repeatedStarts / Math.max(2, sents.length / 2)) : 0;
  const longC = Math.max(0, Math.min(1, (mean - 22) / 18));                             // long, even sentences
  const score = n < 12 ? Math.round(phraseC * 60) : Math.round(100 * (0.55 * phraseC + 0.2 * rhythmC + 0.15 * startC + 0.1 * longC));

  const byCategory = {};
  for (const f of findings) byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  return {
    score: Math.max(0, Math.min(100, score)),
    label: score < 25 ? 'Reads human' : score < 50 ? 'A little stiff' : score < 75 ? 'Robotic in places' : 'Reads like a template',
    findings, byCategory,
    stats: { words: n, sentences: sents.length, avgSentence: Math.round(mean * 10) / 10, sentenceSpread: Math.round(sd * 10) / 10, repeatedStarts, passive },
  };
}

// ---------------------------------------------------------------- rewrite ---

/**
 * @param {string} text
 * @param {{ mode?: 'humanize'|'paraphrase'|'shorten'|'expand'|'grammar', level?: 'light'|'balanced'|'deep',
 *           style?: 'natural'|'professional'|'casual'|'academic'|'persuasive', creativity?: number,
 *           preserve?: boolean, terms?: string[] }} options
 */
export function rewrite(text, options = {}) {
  const { mode = 'humanize', level = 'light', style = 'natural', creativity = 50, preserve = true, terms = [] } = options;
  const guard = protect(String(text || ''), terms, preserve);
  let s = guard.text;
  const changes = [];
  const apply = (re, to, ruleId) => {
    re.lastIndex = 0;
    s = s.replace(re, (...args) => {
      const m = args[0];
      const out = typeof to === 'function' ? to(...args) : expand(to, args);
      if (out !== m) changes.push({ ruleId, before: m.trim(), after: (out ?? '').trim() });
      return out ?? m;
    });
  };

  if (mode === 'grammar') {
    s = grammarPass(s, changes);
  } else if (mode === 'expand') {
    s = expandPass(s, changes);
  } else {
    const max = LEVELS[level] ?? 0;
    for (const rule of RULES) {
      if (rule.to === null) continue;                                 // flag-only rules
      if (LEVELS[rule.level] > max && !(mode === 'shorten' && rule.category === 'redundancy')) continue;
      if (rule.persuasiveOnly && style !== 'persuasive') continue;
      if (style === 'academic' && rule.category === 'transition' && rule.id === 'furthermore') continue; // academic keeps formal links
      apply(rule.re, rule.to, rule.id);
    }
    if (mode === 'paraphrase' || (mode === 'humanize' && creativity >= 67)) plainWords();
    if (mode === 'shorten') apply(INTENSIFIERS, '', 'intensifier');
    if ((style === 'casual' || (style === 'natural' && creativity >= 34)) && style !== 'academic' && mode !== 'shorten') {
      for (const [re, to] of CONTRACT) apply(re, to, 'contraction');
    }
    if (max >= 2 || mode === 'paraphrase') varyStarts();
    if (max >= 2 && creativity >= 50) splitLong();
  }

  s = tidy(s);
  return { text: guard.restore(s), changes };

  function plainWords() {
    for (const [from, to] of Object.entries(PLAIN)) {
      apply(new RegExp(`\\b${from}\\b`, 'gi'), (m) => matchCase(m, to), 'plain-word');
    }
  }
  // Two sentences in a row opening with the same word: drop a stock opener
  // ("Also," / "This") from the second so the rhythm varies.
  function varyStarts() {
    const parts = s.split(/(?<=[.!?])\s+/);
    for (let i = 1; i < parts.length; i++) {
      const a = parts[i - 1].split(/\s+/)[0]?.toLowerCase(), b = parts[i].split(/\s+/)[0]?.toLowerCase();
      if (a && a === b && /^(also,|additionally,|this|the|it|we|they)$/.test(b)) {
        const before = parts[i];
        if (/^(also,|additionally,)$/.test(b)) parts[i] = capitalize(parts[i].replace(/^\S+\s+/, ''));
        else if (b === 'this' || b === 'it') parts[i] = parts[i].replace(/^\S+/, b === 'this' ? 'That' : 'This');
        if (parts[i] !== before) changes.push({ ruleId: 'vary-start', before, after: parts[i] });
      }
    }
    s = parts.join(' ');
  }
  // Very long sentences (> 32 words) split at "; " or ", and " / ", but ".
  function splitLong() {
    s = s.split(/(?<=[.!?])\s+/).map((sent) => {
      if (words(sent) <= 32) return sent;
      const at = sent.search(/;\s+|,\s+(?:and|but|so)\s+/);
      if (at < 40 || at > sent.length - 30) return sent;
      const rest = sent.slice(at).replace(/^;\s+|^,\s+(?:and|so)\s+/, '').replace(/^,\s+but\s+/, 'But ');
      const out = `${sent.slice(0, at)}. ${capitalize(rest)}`;
      changes.push({ ruleId: 'split-long', before: sent, after: out });
      return out;
    }).join(' ');
  }
}

function grammarPass(s, changes) {
  const fixes = [
    [/\bi\b(?=['\s,.!?])/g, 'I', 'capital-i'],
    [/\b(\w+)\s+\1\b/gi, (m, w) => (/^(had|that)$/i.test(w) ? m : w), 'repeated-word'],
    [/\ba\s+(?=[aeio]\w)/gi, (m) => (m[0] === 'A' ? 'An ' : 'an '), 'a-an'],
    [/\ban\s+(?=[bcdfgjklmnpqrstvwxyz]\w)/gi, (m) => (m[0] === 'A' ? 'A ' : 'a '), 'a-an'],
    [/([!?])\1+/g, '$1', 'repeat-punctuation'],
    [/\s+([,.;:!?])/g, '$1', 'space-before-punctuation'],
    [/([,;:])(?=[A-Za-z])/g, '$1 ', 'space-after-punctuation'],
    [/\b(alot)\b/gi, 'a lot', 'spelling'], [/\b(definately)\b/gi, 'definitely', 'spelling'],
    [/\b(seperate)\b/gi, 'separate', 'spelling'], [/\b(recieve)\b/gi, 'receive', 'spelling'],
    [/\b(occured)\b/gi, 'occurred', 'spelling'], [/\b(untill)\b/gi, 'until', 'spelling'],
  ];
  for (const [re, to, ruleId] of fixes) {
    s = s.replace(re, (...args) => {
      const m = args[0];
      const out = typeof to === 'function' ? to(...args) : expand(to, args);
      if (out !== m) changes.push({ ruleId, before: m, after: out });
      return out;
    });
  }
  return s;
}

/**
 * Expand never invents content (that is how "meaning preserved" gets broken).
 * It marks vague claims with a bracketed prompt telling the writer what detail
 * would make the sentence concrete.
 */
function expandPass(s, changes) {
  const vague = /\b(?:significant(?:ly)?|various|numerous|many|several|important|improved|better|great|huge|a lot|impact(?:ed|s)?)\b/i;
  return s.split(/(?<=[.!?])\s+/).map((sent) => {
    if (!vague.test(sent) || /\d|\uE000/.test(sent) || words(sent) < 6) return sent;
    const hint = /improv|better|impact/i.test(sent) ? '[add a number: how much?]'
      : /various|numerous|many|several|a lot/i.test(sent) ? '[name one or two examples]'
      : '[say why, with one concrete example]';
    const out = sent.replace(/([.!?])$/, ` ${hint}$1`);
    changes.push({ ruleId: 'expand-prompt', before: sent, after: out });
    return out;
  }).join(' ');
}

/** Expand "$1"-style group references against a replace() callback's args. */
function expand(template, args) {
  return template.replace(/\$(\d)/g, (_, n) => (typeof args[n] === 'string' ? args[n] : ''));
}

function tidy(s) {
  return s
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?;:])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/(^|[.!?]\s+|\n)\s*,\s*/g, '$1')
    .replace(/(^|[.!?]["')\]]?\s+|\n)([a-z])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\bAlso, also\b/gi, 'Also')
    // Two sentences in a row both opening "Also," read as generated too: keep the first.
    .replace(/(Also, [^.!?]*[.!?]\s+)Also, ([a-z])/g, (m, first, c) => first + c.toUpperCase())
    .replace(/^\s+|\s+$/g, '');
}

function capitalize(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
function matchCase(src, word) {
  if (src === src.toUpperCase() && src.length > 1) return word.toUpperCase();
  if (src[0] === src[0].toUpperCase()) return capitalize(word);
  return word;
}

// ------------------------------------------------------------------- diff ---

/** Word-level diff: [{ type: 'same'|'add'|'del', text }]. LCS on tokens. */
export function diffWords(a, b) {
  const A = String(a).split(/(\s+)/), B = String(b).split(/(\s+)/);
  if (A.length * B.length > 4_000_000) return [{ type: 'del', text: a }, { type: 'add', text: b }];
  const dp = Array.from({ length: A.length + 1 }, () => new Uint32Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) {
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out = [];
  const push = (type, text) => { const last = out[out.length - 1]; if (last && last.type === type) last.text += text; else out.push({ type, text }); };
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { push('same', A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', A[i++]);
    else push('add', B[j++]);
  }
  while (i < A.length) push('del', A[i++]);
  while (j < B.length) push('add', B[j++]);
  return out;
}
