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

// ── Keyboard command (activeTab + scripting) ──

test('read-selection command injects a function into the tab and opens the reader with its result', async () => {
  const chrome = loadBackground({ inject: () => 'Per Tastenkürzel' });
  chrome.commands.onCommand.dispatch('read-selection', { id: 42 });
  await flush();
  await flush();
  assert.equal(chrome.scripting.injections.length, 1);
  const details = chrome.scripting.injections[0];
  assert.equal(details.target.tabId, 42);
  assert.equal(typeof details.func, 'function');
  assert.equal(details.files, undefined, 'only a one-off function, no content script file');
  assert.equal(chrome.storage.session.data.pendingText.text, 'Per Tastenkürzel');
  assert.equal(chrome.createdTabs.length, 1);
});

test('injected selection function reads and trims window.getSelection()', async () => {
  const chrome = loadBackground();
  chrome.commands.onCommand.dispatch('read-selection', { id: 1 });
  await flush();
  const { func } = chrome.scripting.injections[0];
  // Run it in a page-like scope: executeScript serializes the function, so it must not use closures.
  const fn = new Function('window', `return (${func.toString()})();`);
  assert.equal(fn({ getSelection: () => ({ toString: () => '  Auswahl ' }) }), 'Auswahl');
  assert.equal(fn({ getSelection: () => null }), '');
});

test('read-selection command with empty selection opens nothing', async () => {
  const chrome = loadBackground({ inject: () => '' });
  chrome.commands.onCommand.dispatch('read-selection', { id: 42 });
  await flush();
  await flush();
  assert.equal(chrome.createdTabs.length, 0);
});

test('read-selection command on a restricted page fails quietly', async () => {
  const chrome = loadBackground({ inject: () => { throw new Error('Cannot access a chrome:// URL'); } });
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    chrome.commands.onCommand.dispatch('read-selection', { id: 42 });
    await flush();
    await flush();
  } finally {
    console.warn = warn;
  }
  assert.equal(chrome.createdTabs.length, 0);
  assert.equal(warnings.length, 1);
});

test('other commands or commands without a tab are ignored', async () => {
  const chrome = loadBackground({ inject: () => 'x' });
  chrome.commands.onCommand.dispatch('something-else', { id: 1 });
  chrome.commands.onCommand.dispatch('read-selection', undefined);
  await flush();
  assert.equal(chrome.scripting.injections.length, 0);
});
