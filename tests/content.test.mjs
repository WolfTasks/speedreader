// tests/content.test.mjs — content.js (picker, CSS selector, selection) against a fake DOM
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeChrome, sendRuntimeMessage } from './helpers/fake-chrome.mjs';
import { loadScript } from './helpers/load-script.mjs';

function fakeElement(innerText = '') {
  return { innerText, style: { outline: '' } };
}

function loadContent({ elements = {}, selection = '' } = {}) {
  const chrome = createFakeChrome();
  const docListeners = {};
  const document = {
    body: { style: { cursor: '' } },
    addEventListener(type, fn) { docListeners[type] = fn; },
    querySelector(sel) {
      if (sel === '::invalid') throw new SyntaxError('bad selector');
      return elements[sel] ?? null;
    },
  };
  const window = { getSelection: () => ({ toString: () => selection }) };
  loadScript('content.js', { chrome, document, window });
  const fire = (type, event) => docListeners[type]({ preventDefault() {}, stopPropagation() {}, ...event });
  return { chrome, document, fire };
}

test('ACTIVATE_PICKER switches to crosshair cursor and answers ok', async () => {
  const { chrome, document } = loadContent();
  const resp = await sendRuntimeMessage(chrome, { type: 'ACTIVATE_PICKER' });
  assert.equal(resp.ok, true);
  assert.equal(document.body.style.cursor, 'crosshair');
});

test('picker: hover outlines element, click sends its text and exits picker', async () => {
  const { chrome, document, fire } = loadContent();
  await sendRuntimeMessage(chrome, { type: 'ACTIVATE_PICKER' });

  const el = fakeElement('  Picked paragraph  ');
  fire('mouseover', { target: el });
  assert.notEqual(el.style.outline, '');

  fire('click', { target: el });
  assert.deepEqual(chrome.sentMessages.map((m) => ({ ...m })), [{ type: 'READ_TEXT', text: 'Picked paragraph' }]);
  assert.equal(el.style.outline, '');
  assert.equal(document.body.style.cursor, '');
});

test('picker: hovering a second element removes outline from the first', async () => {
  const { chrome, fire } = loadContent();
  await sendRuntimeMessage(chrome, { type: 'ACTIVATE_PICKER' });
  const a = fakeElement('a');
  const b = fakeElement('b');
  fire('mouseover', { target: a });
  fire('mouseover', { target: b });
  assert.equal(a.style.outline, '');
  assert.notEqual(b.style.outline, '');
});

test('picker: clicking an element without text sends nothing', async () => {
  const { chrome, fire } = loadContent();
  await sendRuntimeMessage(chrome, { type: 'ACTIVATE_PICKER' });
  fire('click', { target: fakeElement('   ') });
  assert.equal(chrome.sentMessages.length, 0);
});

test('picker: Escape cancels, later clicks are ignored', async () => {
  const { chrome, document, fire } = loadContent();
  await sendRuntimeMessage(chrome, { type: 'ACTIVATE_PICKER' });
  fire('keydown', { key: 'Escape' });
  assert.equal(document.body.style.cursor, '');
  fire('click', { target: fakeElement('ignored') });
  assert.equal(chrome.sentMessages.length, 0);
});

test('events are ignored while picker is inactive', () => {
  const { chrome, fire } = loadContent();
  const el = fakeElement('text');
  fire('mouseover', { target: el });
  fire('click', { target: el });
  assert.equal(el.style.outline, '');
  assert.equal(chrome.sentMessages.length, 0);
});

test('USE_SELECTOR: found element with text is sent to the reader', async () => {
  const { chrome } = loadContent({ elements: { article: fakeElement(' Artikeltext ') } });
  const resp = await sendRuntimeMessage(chrome, { type: 'USE_SELECTOR', selector: 'article' });
  assert.equal(resp.ok, true);
  assert.equal(chrome.sentMessages[0].text, 'Artikeltext');
});

test('USE_SELECTOR: missing element → NOT_FOUND', async () => {
  const { chrome } = loadContent();
  const resp = await sendRuntimeMessage(chrome, { type: 'USE_SELECTOR', selector: '.nonexistent' });
  assert.equal(resp.error, 'NOT_FOUND');
});

test('USE_SELECTOR: invalid selector → NOT_FOUND instead of throwing', async () => {
  const { chrome } = loadContent();
  const resp = await sendRuntimeMessage(chrome, { type: 'USE_SELECTOR', selector: '::invalid' });
  assert.equal(resp.error, 'NOT_FOUND');
});

test('USE_SELECTOR: element without text → EMPTY', async () => {
  const { chrome } = loadContent({ elements: { head: fakeElement('') } });
  const resp = await sendRuntimeMessage(chrome, { type: 'USE_SELECTOR', selector: 'head' });
  assert.equal(resp.error, 'EMPTY');
  assert.equal(chrome.sentMessages.length, 0);
});

test('READ_SELECTION: sends trimmed selection', async () => {
  const { chrome } = loadContent({ selection: '  markierter Text ' });
  const resp = await sendRuntimeMessage(chrome, { type: 'READ_SELECTION' });
  assert.equal(resp.ok, true);
  assert.equal(chrome.sentMessages[0].text, 'markierter Text');
});

test('READ_SELECTION: empty selection → EMPTY', async () => {
  const { chrome } = loadContent({ selection: '' });
  const resp = await sendRuntimeMessage(chrome, { type: 'READ_SELECTION' });
  assert.equal(resp.error, 'EMPTY');
});
