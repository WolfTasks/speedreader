// tests/reader.test.mjs — reader/reader.js (RSVP loop + controls) against a fake DOM
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { loadReader, cleanupReaderGlobals } from './helpers/fake-reader-dom.mjs';

// 6 words: plain, plain, long (>10 chars → 1.4x), plain, plain, sentence end (2x)
const TEXT = 'Alpha beta Extraordinarily delta epsilon zeta.';
const BASE = 60000 / 250; // 240 ms per word at the default 250 WPM

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => {
  mock.timers.reset();
  cleanupReaderGlobals();
});

// mock.timers.tick(n) does not run timeouts that are scheduled *during* the tick,
// so the setTimeout chain is advanced in 1 ms steps.
function advance(ms) {
  for (let i = 0; i < ms; i++) mock.timers.tick(1);
}

async function readyReader(text = TEXT) {
  const r = await loadReader();
  r.respond({ text });
  return r;
}

// ── Handshake ──

test('on load sends READER_READY to the background', async () => {
  const r = await loadReader();
  assert.deepEqual(r.sentMessages, [{ type: 'READER_READY' }]);
});

test('received text shows first word with ORP split and word count', async () => {
  const r = await readyReader();
  assert.equal(r.el('word-before').textContent, '');
  assert.equal(r.el('word-orp').textContent, 'A');
  assert.equal(r.el('word-after').textContent, 'lpha');
  assert.equal(r.progress(), '1 / 6');
  assert.equal(r.el('error-banner').hidden, true);
  assert.equal(r.el('controls').hidden, false);
});

test('ORP split for a longer word puts the highlight off the first letter', async () => {
  const r = await readyReader('Reading is fundamental for everybody here');
  r.el('btn-playpause').click();
  assert.equal(r.word(), 'Reading');
  assert.equal(r.el('word-orp').textContent, 'e');
});

test('null text shows the error banner and hides controls', async () => {
  const r = await loadReader();
  r.respond({ text: null });
  assert.equal(r.el('error-banner').hidden, false);
  assert.equal(r.el('controls').hidden, true);
});

test('missing response (e.g. background unavailable) shows the error banner', async () => {
  const r = await loadReader();
  r.respond(undefined, { lastError: { message: 'Could not establish connection' } });
  assert.equal(r.el('error-banner').hidden, false);
  assert.equal(r.el('controls').hidden, true);
});

test('whitespace-only text yields no tokens → error banner', async () => {
  const r = await readyReader('   \n  ');
  assert.equal(r.el('error-banner').hidden, false);
  assert.equal(r.el('controls').hidden, true);
});

test('short text (< 5 words) is shown at once without controls or keyboard shortcut', async () => {
  const r = await readyReader('Nur drei Wörter');
  assert.equal(r.el('word-orp').textContent, 'Nur drei Wörter');
  assert.equal(r.word(), 'Nur drei Wörter');
  assert.equal(r.progress(), '3 / 3');
  assert.equal(r.el('controls').hidden, true);
  assert.equal(r.keydown('Space'), false, 'Space must not be handled');
  advance(10_000);
  assert.equal(r.word(), 'Nur drei Wörter');
});

// ── RSVP timing ──

test('words advance after 60000/WPM ms, scaled by each pause multiplier', async () => {
  const r = await readyReader();
  r.el('btn-playpause').click();
  assert.equal(r.word(), 'Alpha');

  advance(BASE - 1);
  assert.equal(r.word(), 'Alpha', 'must not advance early');
  advance(1);
  assert.equal(r.word(), 'beta');

  advance(BASE);
  assert.equal(r.word(), 'Extraordinarily');

  // long word stays 1.4x as long
  advance(Math.round(BASE * 1.4) - 1);
  assert.equal(r.word(), 'Extraordinarily');
  advance(1);
  assert.equal(r.word(), 'delta');
  assert.equal(r.progress(), '4 / 6');
});

test('sentence-ending word is held 2x before the done banner appears', async () => {
  const r = await readyReader();
  r.el('btn-playpause').click();
  advance(Math.round(BASE * 4 + BASE * 1.4)); // → "zeta."
  assert.equal(r.word(), 'zeta');
  assert.equal(r.progress(), '6 / 6');

  advance(BASE * 2 - 1);
  assert.equal(r.el('done-banner').hidden, true);
  advance(1);
  assert.equal(r.el('done-banner').hidden, false);
  assert.equal(r.el('btn-playpause').textContent, '▶');
});

test('WPM slider changes the display and the interval from the next word on', async () => {
  const r = await readyReader();
  r.el('btn-playpause').click();
  r.setWpm(500);
  assert.equal(r.el('wpm-display').textContent, 500);

  // current word still uses the old 240 ms interval
  advance(BASE);
  assert.equal(r.word(), 'beta');
  // next word uses 60000/500 = 120 ms
  advance(120);
  assert.equal(r.word(), 'Extraordinarily');
});

// ── Controls ──

test('play/pause button toggles playback and icon', async () => {
  const r = await readyReader();
  const btn = r.el('btn-playpause');
  btn.click();
  assert.equal(btn.textContent, '⏸');
  btn.click();
  assert.equal(btn.textContent, '▶');
  advance(10_000);
  assert.equal(r.word(), 'Alpha', 'paused reader must not advance');
});

test('resuming after pause continues from the current word', async () => {
  const r = await readyReader();
  r.el('btn-playpause').click();
  advance(BASE);
  r.el('btn-playpause').click(); // pause on "beta"
  advance(10_000);
  r.el('btn-playpause').click();
  assert.equal(r.word(), 'beta');
  advance(BASE);
  assert.equal(r.word(), 'Extraordinarily');
});

test('Space toggles play/pause on the page and prevents scrolling', async () => {
  const r = await readyReader();
  assert.equal(r.keydown('Space'), true);
  assert.equal(r.el('btn-playpause').textContent, '⏸');
  r.keydown('Space');
  assert.equal(r.el('btn-playpause').textContent, '▶');
});

test('Space is ignored while focus is on an input or button', async () => {
  const r = await readyReader();
  assert.equal(r.keydown('Space', r.el('wpm-slider')), false);
  assert.equal(r.keydown('Space', r.el('btn-restart')), false);
  assert.equal(r.el('btn-playpause').textContent, '▶');
});

test('other keys are ignored', async () => {
  const r = await readyReader();
  assert.equal(r.keydown('Enter'), false);
  assert.equal(r.el('btn-playpause').textContent, '▶');
});

test('restart button pauses and jumps back to the first word', async () => {
  const r = await readyReader();
  r.el('btn-playpause').click();
  advance(BASE * 2);
  assert.equal(r.word(), 'Extraordinarily');

  r.el('btn-restart').click();
  assert.equal(r.word(), 'Alpha');
  assert.equal(r.progress(), '1 / 6');
  assert.equal(r.el('btn-playpause').textContent, '▶');
  advance(10_000);
  assert.equal(r.word(), 'Alpha', 'restart must not keep the old timer running');
});

test('done banner "Neu starten" restarts from the beginning and plays', async () => {
  const r = await readyReader();
  r.el('btn-playpause').click();
  advance(60_000);
  assert.equal(r.el('done-banner').hidden, false);

  r.el('btn-done-restart').click();
  assert.equal(r.el('done-banner').hidden, true);
  assert.equal(r.word(), 'Alpha');
  assert.equal(r.el('btn-playpause').textContent, '⏸');
  advance(BASE);
  assert.equal(r.word(), 'beta');
});

test('play after the last word does nothing until restarted', async () => {
  const r = await readyReader();
  r.el('btn-playpause').click();
  advance(60_000);
  r.el('btn-playpause').click();
  assert.equal(r.el('btn-playpause').textContent, '▶');
  assert.equal(r.el('done-banner').hidden, false);
});
