// tests/background.test.mjs — background.js service worker logic against a fake chrome API
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeChrome, sendRuntimeMessage } from './helpers/fake-chrome.mjs';
import { loadScript, flush } from './helpers/load-script.mjs';

function loadBackground(options) {
  const chrome = createFakeChrome(options);
  loadScript('background.js', { chrome });
  return chrome;
}

test('onInstalled registers the selection context menu', () => {
  const chrome = loadBackground();
  chrome.runtime.onInstalled.dispatch();
  assert.equal(chrome.createdMenus.length, 1);
  assert.equal(chrome.createdMenus[0].id, 'speedreader-read');
  assert.deepEqual([...chrome.createdMenus[0].contexts], ['selection']);
});

test('context menu click stores trimmed selection and opens the reader tab', async () => {
  const chrome = loadBackground();
  chrome.contextMenus.onClicked.dispatch({ menuItemId: 'speedreader-read', selectionText: '  some text  ' });
  await flush();
  assert.equal(chrome.storage.session.data.pendingText.text, 'some text');
  assert.equal(chrome.createdTabs[0].url, 'chrome-extension://test-id/reader/reader.html');
});

test('context menu click for another menu id or without selection does nothing', async () => {
  const chrome = loadBackground();
  chrome.contextMenus.onClicked.dispatch({ menuItemId: 'other', selectionText: 'x' });
  chrome.contextMenus.onClicked.dispatch({ menuItemId: 'speedreader-read', selectionText: '' });
  await flush();
  assert.equal(chrome.createdTabs.length, 0);
  assert.equal(chrome.storage.session.data.pendingText, undefined);
});

test('READ_TEXT stores text before opening the tab and responds ok', async () => {
  const chrome = loadBackground();
  const response = await sendRuntimeMessage(chrome, { type: 'READ_TEXT', text: 'Hallo Welt' });
  assert.deepEqual({ ...response }, { ok: true });
  assert.equal(chrome.storage.session.data.pendingText.text, 'Hallo Welt');
  assert.equal(typeof chrome.storage.session.data.pendingText.timestamp, 'number');
  assert.equal(chrome.createdTabs.length, 1);
});

test('READ_TEXT without text is ignored', async () => {
  const chrome = loadBackground();
  const response = await sendRuntimeMessage(chrome, { type: 'READ_TEXT', text: '' });
  assert.equal(response, undefined);
  assert.equal(chrome.createdTabs.length, 0);
});

test('READER_READY delivers the pending text once and then clears it', async () => {
  const chrome = loadBackground();
  await sendRuntimeMessage(chrome, { type: 'READ_TEXT', text: 'Einmal lesen' });

  const first = await sendRuntimeMessage(chrome, { type: 'READER_READY' });
  assert.equal(first.text, 'Einmal lesen');
  await flush();

  const second = await sendRuntimeMessage(chrome, { type: 'READER_READY' });
  assert.equal(second.text, null);
});

test('falls back to local storage when session storage is unavailable', async () => {
  const chrome = loadBackground({ sessionBroken: true });
  await sendRuntimeMessage(chrome, { type: 'READ_TEXT', text: 'Fallback' });
  assert.equal(chrome.storage.local.data.pendingText.text, 'Fallback');

  const ready = await sendRuntimeMessage(chrome, { type: 'READER_READY' });
  assert.equal(ready.text, 'Fallback');
  await flush();
  assert.equal(chrome.storage.local.data.pendingText, undefined);
});

test('unknown message types get no response', async () => {
  const chrome = loadBackground();
  assert.equal(await sendRuntimeMessage(chrome, { type: 'NOPE' }), undefined);
});

test('messages from other senders are rejected and do not consume pending text', async () => {
  const chrome = loadBackground();
  const foreign = { id: 'other-extension' };
  assert.equal(await sendRuntimeMessage(chrome, { type: 'READ_TEXT', text: 'fremd' }, foreign), undefined);
  assert.equal(chrome.createdTabs.length, 0);

  await sendRuntimeMessage(chrome, { type: 'READ_TEXT', text: 'eigen' });
  assert.equal(await sendRuntimeMessage(chrome, { type: 'READER_READY' }, foreign), undefined);
  assert.equal(await sendRuntimeMessage(chrome, { type: 'READER_READY' }, {}), undefined);
  assert.equal(chrome.storage.session.data.pendingText.text, 'eigen');
});

test('pending text older than 5 minutes is not delivered', async () => {
  const chrome = loadBackground({ sessionBroken: true });
  await sendRuntimeMessage(chrome, { type: 'READ_TEXT', text: 'alt' });
  chrome.storage.local.data.pendingText.timestamp -= 5 * 60 * 1000 + 1;
  const ready = await sendRuntimeMessage(chrome, { type: 'READER_READY' });
  assert.equal(ready.text, null);
  await flush();
  assert.equal(chrome.storage.local.data.pendingText, undefined);
});

test('storing in session storage removes a leftover local copy', async () => {
  const chrome = loadBackground();
  chrome.storage.local.data.pendingText = { text: 'Rest', timestamp: Date.now() };
  await sendRuntimeMessage(chrome, { type: 'READ_TEXT', text: 'Neu' });
  assert.equal(chrome.storage.local.data.pendingText, undefined);
  assert.equal(chrome.storage.session.data.pendingText.text, 'Neu');
});

test('browser startup and install purge stale local text but keep fresh text', async () => {
  const chrome = loadBackground();
  chrome.storage.local.data.pendingText = { text: 'alt', timestamp: Date.now() - 6 * 60 * 1000 };
  chrome.runtime.onStartup.dispatch();
  await flush();
  assert.equal(chrome.storage.local.data.pendingText, undefined);

  chrome.storage.local.data.pendingText = { text: 'frisch', timestamp: Date.now() };
  chrome.runtime.onInstalled.dispatch();
  await flush();
  assert.equal(chrome.storage.local.data.pendingText.text, 'frisch');
});
