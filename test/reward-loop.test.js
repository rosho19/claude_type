'use strict';

// ── Reward-loop regression test ───────────────────────────────────────────────
// game.html runs inside a WKWebView, so there's no browser here to render it.
// Instead we mount the page's real <script> over a minimal DOM / localStorage /
// WebSocket mock, type actual words via synthetic keydown events, and drive the
// server's lifecycle messages (working / permission / done). That exercises the
// genuine session-banking, persistence, and banner code — not a reimplementation.
//
// What it pins down:
//   • a finished turn banks words / wpm / accuracy and shows them in the banner
//   • best wpm + lifetime word count persist to localStorage (and the drag bar)
//   • a beaten record raises the "new best!" flourish
//   • banking is idempotent (a repeated Stop records nothing)
//   • session totals survive the idle/Escape resets between typing bursts
//   • typing is ignored during a permission gate and resumes afterward
//
// Run with `npm test`. No test framework — just asserts and an exit code.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fakeClock = 1_000_000;
const captured = { keydown: null, wsMessage: null };

// ── selector matching (supports ".a", ".a:not(.b)", and comma lists) ──────────
function matchOne(el, part) {
  part = part.trim();
  const notM = part.match(/:not\(\.([\w-]+)\)/);
  const base = part.replace(/:not\([^)]*\)/, '');
  const need = (base.match(/\.([\w-]+)/g) || []).map(s => s.slice(1));
  const have = (el.className || '').split(/\s+/).filter(Boolean);
  if (need.some(n => !have.includes(n))) return false;
  if (notM && have.includes(notM[1])) return false;
  return true;
}
const matchSel = (el, sel) => sel.split(',').some(p => matchOne(el, p));

function makeEl(tag) {
  const el = {
    tagName: tag, _children: [], _text: '', parentNode: null,
    className: '', dataset: {}, style: {},
    appendChild(node) {
      if (node && node.isFragment) { node._children.forEach(c => { c.parentNode = el; el._children.push(c); }); node._children = []; }
      else { node.parentNode = el; el._children.push(node); }
      return node;
    },
    append(...nodes) { nodes.forEach(n => el.appendChild(n)); },
    remove() { const p = el.parentNode; if (p) { const i = p._children.indexOf(el); if (i >= 0) p._children.splice(i, 1); } },
    querySelectorAll(sel) {
      const out = [];
      (function walk(n) { for (const c of n._children) { if (matchSel(c, sel)) out.push(c); walk(c); } })(el);
      return out;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 30, right: 10, bottom: 30 }),
    get offsetTop() { return 0; },
    get offsetWidth() { return 0; },
  };
  el.classList = {
    add:    (...cs) => { const s = new Set((el.className || '').split(/\s+/).filter(Boolean)); cs.forEach(c => s.add(c)); el.className = [...s].join(' '); },
    remove: (...cs) => { const s = new Set((el.className || '').split(/\s+/).filter(Boolean)); cs.forEach(c => s.delete(c)); el.className = [...s].join(' '); },
    contains: c => (el.className || '').split(/\s+/).includes(c),
  };
  Object.defineProperty(el, 'textContent', {
    get() { return el._children.length ? el._children.map(c => c.textContent).join('') : el._text; },
    set(v) { el._text = String(v); el._children = []; },
  });
  Object.defineProperty(el, 'innerHTML', { get() { return ''; }, set() { el._text = ''; el._children = []; } });
  return el;
}

const elements = {};
['words', 'words-wrapper', 'caret', 'stats', 'banner', 's-wpm', 's-raw', 's-acc', 'lifetime']
  .forEach(id => { elements[id] = makeEl('div'); });

const store = new Map();
const ctx = {
  console, JSON, Math,
  Date: { now: () => fakeClock },
  location: { host: '' },
  window: { webkit: undefined },
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  },
  WebSocket: function (url) {
    this.url = url;
    this.addEventListener = (t, h) => { if (t === 'message') captured.wsMessage = h; };
  },
  requestAnimationFrame: cb => { cb(); return 0; },
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  document: {
    getElementById: id => elements[id],
    createElement: makeEl,
    createDocumentFragment: () => { const f = makeEl('frag'); f.isFragment = true; return f; },
    addEventListener: (t, h) => { if (t === 'keydown') captured.keydown = h; },
  },
};

// ── run the real game script ──────────────────────────────────────────────────
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'game.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
vm.createContext(ctx);
new vm.Script(script).runInContext(ctx);

// ── drivers ───────────────────────────────────────────────────────────────────
const wordsEl = elements.words;
const bannerEl = elements.banner;
const press = k => { fakeClock += 120; captured.keydown({ key: k, preventDefault() {}, ctrlKey: false, altKey: false, metaKey: false }); };
function typeWords(n, startIdx = 0) {
  for (let i = 0; i < n; i++) {
    for (const ch of wordsEl._children[startIdx + i].dataset.word) press(ch);
    press(' ');
  }
}
// Escape → hardReset repopulates the board and returns wIdx to 0 while the session
// totals survive, so we can reliably type N *correct* words (matched from index 0)
// no matter where the persistent stream left off.
const typeFresh = n => { press('Escape'); typeWords(n, 0); };
const send = obj => captured.wsMessage({ data: JSON.stringify(obj) });
const readStore = () => JSON.parse(store.get('monkeytype.stats.v1') || '{}');

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) failures++; };

// ── 1. a finished turn banks stats and shows the summary ──────────────────────
send({ type: 'status', value: 'working', show: true });   // new prompt
typeFresh(12);
send({ type: 'status', value: 'done' });

const s1 = readStore();
ok(s1.lifetimeWords === 12, `lifetimeWords banked = 12 (got ${s1.lifetimeWords})`);
ok(s1.bestWpm > 0, `bestWpm recorded > 0 (got ${s1.bestWpm})`);
const label1 = bannerEl._children[0].textContent;
ok(/12 words/.test(label1) && /\d+ wpm/.test(label1) && /%/.test(label1), `done banner shows summary: "${label1}"`);
ok(bannerEl._children.some(c => c.className === 'pb'), 'first session over threshold → "new best!" flourish shown');
ok(/best \d+/.test(elements.lifetime.textContent) && /words/.test(elements.lifetime.textContent), `drag-bar lifetime updated: "${elements.lifetime.textContent}"`);

// ── 2. a second `done` with no new typing must NOT double-count ───────────────
send({ type: 'status', value: 'done' });
ok(readStore().lifetimeWords === 12, `repeat done is idempotent — still 12 (got ${readStore().lifetimeWords})`);

// ── 3. session totals survive an idle/Escape reset mid-turn ───────────────────
send({ type: 'status', value: 'working', show: true });
typeFresh(3);                                              // sess = 3
typeFresh(2);                                              // the Escape here = a mid-turn idle reset; sess must carry → 5
send({ type: 'status', value: 'done' });
ok(readStore().lifetimeWords === 12 + 5, `words survive idle reset: 17 total (got ${readStore().lifetimeWords})`);

// ── 4. permission gate disables typing; resume re-enables ─────────────────────
send({ type: 'status', value: 'working', show: true });
typeFresh(4);                                              // sess = 4
send({ type: 'status', value: 'permission' });
typeWords(3, 0);                                           // ignored — input disabled
send({ type: 'status', value: 'working', show: false });  // resume same turn
typeFresh(2);                                              // sess = 6
send({ type: 'status', value: 'done' });
ok(readStore().lifetimeWords === 17 + 6, `typing ignored during permission; 4+2 banked → 23 (got ${readStore().lifetimeWords})`);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
