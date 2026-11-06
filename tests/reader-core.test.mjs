// tests/reader-core.test.mjs — run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, getOrpIndex, splitAtOrp } from '../reader/reader-core.js';

test('tokenize: splits on whitespace and strips punctuation for display', () => {
  const tokens = tokenize('Hello, world! Foo');
  assert.deepEqual(tokens.map((t) => t.word), ['Hello', 'world', 'Foo']);
});

test('tokenize: sentence end gets 2x pause, plain word 1x', () => {
  const [, world, foo] = tokenize('Hello, world! Foo');
  assert.equal(world.pauseMultiplier, 2);
  assert.equal(foo.pauseMultiplier, 1);
});

test('tokenize: words longer than 10 chars get 1.4x pause', () => {
  assert.equal(tokenize('Extraordinarily')[0].pauseMultiplier, 1.4);
});

test('tokenize: exactly 10 chars is not a long word', () => {
  assert.equal(tokenize('SpeedReads')[0].pauseMultiplier, 1);
});

test('tokenize: sentence end overrides long-word multiplier', () => {
  assert.equal(tokenize('Extraordinarily!')[0].pauseMultiplier, 2);
});

test('tokenize: ? and . also end a sentence, including before a closing quote', () => {
  assert.deepEqual(
    tokenize('Why? Done. "Quoted."').map((t) => t.pauseMultiplier),
    [2, 2, 2],
  );
});

test('tokenize: empty and whitespace-only input yield no tokens', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('   \n\t '), []);
});

test('tokenize: newlines and tabs separate words', () => {
  assert.equal(tokenize('Hello\nworld\tagain').length, 3);
});

test('tokenize: keeps German umlauts and accented letters', () => {
  assert.deepEqual(tokenize('„Größe“ café').map((t) => t.word), ['Größe', 'café']);
});

test('tokenize: pure punctuation token is kept as-is instead of becoming empty', () => {
  assert.equal(tokenize('a — b')[1].word, '—');
});

test('getOrpIndex: follows floor(len * 0.3) - 1 with minimum 0', () => {
  const cases = { A: 0, Hi: 0, the: 0, Hello: 0, Reading: 1, SpeedReads: 2, Extraordinarily: 3 };
  for (const [word, expected] of Object.entries(cases)) {
    assert.equal(getOrpIndex(word), expected, word);
  }
});

test('getOrpIndex: empty word → 0', () => {
  assert.equal(getOrpIndex(''), 0);
});

test('splitAtOrp: parts reassemble to the original word', () => {
  for (const word of ['A', 'Hi', 'Reading', 'Extraordinarily']) {
    const { before, orp, after } = splitAtOrp(word);
    assert.equal(before + orp + after, word);
  }
});

test('splitAtOrp: "Reading" → R | e | ading', () => {
  assert.deepEqual(splitAtOrp('Reading'), { before: 'R', orp: 'e', after: 'ading' });
});

test('splitAtOrp: single char and empty word', () => {
  assert.deepEqual(splitAtOrp('A'), { before: '', orp: 'A', after: '' });
  assert.deepEqual(splitAtOrp(''), { before: '', orp: '', after: '' });
});
