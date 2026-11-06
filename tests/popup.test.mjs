// tests/popup.test.mjs — popup/popup.js against a fake DOM, chrome API and vendor libs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPopup, fakeFile, fakePdfjs, fakeMammoth } from './helpers/fake-popup-dom.mjs';

const plain = (o) => JSON.parse(JSON.stringify(o));

// ── Setup ──

test('pdf.js worker path is set to the extension-internal URL', () => {
  const p = loadPopup();
  assert.equal(p.pdfjsLib.GlobalWorkerOptions.workerSrc, 'chrome-extension://test-id/vendor/pdf.worker.min.js');
});

test('loads without pdfjsLib present', () => {
  assert.doesNotThrow(() => loadPopup({ pdfjsLib: undefined }));
});

// ── Markierten Text lesen ──

test('selection: success sends READ_SELECTION to active tab and closes popup', async () => {
  const p = loadPopup({ contentResponse: { ok: true } });
  await p.el['btn-selection'].fire('click');
  assert.deepEqual(plain(p.tabMessages), [{ tabId: 7, message: { type: 'READ_SELECTION' } }]);
  assert.equal(p.closed, 1);
  assert.equal(p.el['global-status'].hidden, true);
});

test('selection: EMPTY shows "Kein Text ausgewählt." and keeps popup open', async () => {
  const p = loadPopup({ contentResponse: { error: 'EMPTY' } });
  await p.el['btn-selection'].fire('click');
  assert.equal(p.el['global-status'].textContent, 'Kein Text ausgewählt.');
  assert.equal(p.el['global-status'].className, 'feedback error');
  assert.equal(p.el['global-status'].hidden, false);
  assert.equal(p.closed, 0);
});

test('selection: content script unreachable → "Seite nicht zugänglich."', async () => {
  const p = loadPopup({ contentResponse: () => { throw new Error('Could not establish connection'); } });
  await p.el['btn-selection'].fire('click');
  assert.equal(p.el['global-status'].textContent, 'Seite nicht zugänglich.');
  assert.equal(p.closed, 0);
});

test('selection: no active tab → "Seite nicht zugänglich."', async () => {
  const p = loadPopup({ tab: null });
  await p.el['btn-selection'].fire('click');
  assert.equal(p.el['global-status'].textContent, 'Seite nicht zugänglich.');
  assert.equal(p.tabMessages.length, 0);
});

test('selection: previous error is cleared on a new attempt', async () => {
  let resp = { error: 'EMPTY' };
  const p = loadPopup({ contentResponse: () => resp });
  await p.el['btn-selection'].fire('click');
  resp = { ok: true };
  await p.el['btn-selection'].fire('click');
  assert.equal(p.el['global-status'].hidden, true);
  assert.equal(p.el['global-status'].textContent, '');
});

// ── Element-Picker ──

test('picker: sends ACTIVATE_PICKER and closes popup', async () => {
  const p = loadPopup();
  await p.el['btn-picker'].fire('click');
  assert.deepEqual(plain(p.tabMessages[0].message), { type: 'ACTIVATE_PICKER' });
  assert.equal(p.closed, 1);
});

test('picker: unreachable page → "Seite nicht zugänglich."', async () => {
  const p = loadPopup({ contentResponse: () => { throw new Error('x'); } });
  await p.el['btn-picker'].fire('click');
  assert.equal(p.el['global-status'].textContent, 'Seite nicht zugänglich.');
  assert.equal(p.closed, 0);
});

// ── CSS-Selektor ──

test('selector: "Laden" sends trimmed selector and closes on success', async () => {
  const p = loadPopup();
  p.el['selector-input'].value = '  article  ';
  await p.el['btn-selector'].fire('click');
  assert.deepEqual(plain(p.tabMessages[0].message), { type: 'USE_SELECTOR', selector: 'article' });
  assert.equal(p.closed, 1);
});

test('selector: Enter key triggers loading, other keys do not', async () => {
  const p = loadPopup();
  p.el['selector-input'].value = 'main';
  await p.el['selector-input'].fire('keydown', { key: 'a' });
  assert.equal(p.tabMessages.length, 0);
  await p.el['selector-input'].fire('keydown', { key: 'Enter' });
  assert.equal(p.tabMessages[0].message.selector, 'main');
});

test('selector: empty/whitespace input sends nothing', async () => {
  const p = loadPopup();
  p.el['selector-input'].value = '   ';
  await p.el['btn-selector'].fire('click');
  assert.equal(p.tabMessages.length, 0);
  assert.equal(p.closed, 0);
});

test('selector: NOT_FOUND marks input red and shows "Element nicht gefunden."', async () => {
  const p = loadPopup({ contentResponse: { error: 'NOT_FOUND' } });
  p.el['selector-input'].value = '.nonexistent';
  await p.el['btn-selector'].fire('click');
  assert.equal(p.el['selector-input'].classList.contains('error'), true);
  assert.equal(p.el['selector-feedback'].textContent, 'Element nicht gefunden.');
  assert.equal(p.el['selector-feedback'].hidden, false);
  assert.equal(p.closed, 0);
});

test('selector: EMPTY shows "Element enthält keinen Text." without red input', async () => {
  const p = loadPopup({ contentResponse: { error: 'EMPTY' } });
  p.el['selector-input'].value = 'head';
  await p.el['btn-selector'].fire('click');
  assert.equal(p.el['selector-feedback'].textContent, 'Element enthält keinen Text.');
  assert.equal(p.el['selector-input'].classList.contains('error'), false);
});

test('selector: red marking is removed on the next attempt', async () => {
  let resp = { error: 'NOT_FOUND' };
  const p = loadPopup({ contentResponse: () => resp });
  p.el['selector-input'].value = '.x';
  await p.el['btn-selector'].fire('click');
  resp = { ok: true };
  await p.el['btn-selector'].fire('click');
  assert.equal(p.el['selector-input'].classList.contains('error'), false);
  assert.equal(p.el['selector-feedback'].hidden, true);
});

test('selector: unreachable page reports in global status', async () => {
  const p = loadPopup({ contentResponse: () => { throw new Error('x'); } });
  p.el['selector-input'].value = 'article';
  await p.el['btn-selector'].fire('click');
  assert.equal(p.el['global-status'].textContent, 'Seite nicht zugänglich.');
});

// ── Datei-Upload ──

test('file: no file selected does nothing', async () => {
  const p = loadPopup();
  p.el['file-input'].files = [];
  await p.el['file-input'].fire('change');
  assert.equal(p.runtimeMessages.length, 0);
  assert.equal(p.el['file-feedback'].hidden, true);
});

test('file: .txt is read as UTF-8 and sent as READ_TEXT, popup closes, input reset', async () => {
  const p = loadPopup();
  await p.upload(fakeFile('notes.TXT', 'Hallo Welt aus einer Datei'));
  assert.deepEqual(plain(p.runtimeMessages), [{ type: 'READ_TEXT', text: 'Hallo Welt aus einer Datei' }]);
  assert.equal(p.closed, 1);
  assert.equal(p.el['file-input'].value, '');
});

test('file: .pdf pages are joined (items by space, pages by blank line)', async () => {
  const pdfjsLib = fakePdfjs([['Seite', 'eins'], ['Seite', 'zwei']]);
  const p = loadPopup({ pdfjsLib });
  await p.upload(fakeFile('doc.pdf', '%PDF-1.7'));
  assert.equal(p.runtimeMessages[0].text, 'Seite eins\n\nSeite zwei');
  assert.ok(pdfjsLib.calls[0].data instanceof ArrayBuffer || pdfjsLib.calls[0].data?.byteLength >= 0);
  assert.equal(p.closed, 1);
});

test('file: .pdf without extractable text reports scan-PDF error', async () => {
  const p = loadPopup({ pdfjsLib: fakePdfjs([[' '], []]) });
  await p.upload(fakeFile('scan.pdf', '%PDF'));
  assert.match(p.el['file-feedback'].textContent, /^Fehler: PDF enthält keinen extrahierbaren Text/);
  assert.equal(p.runtimeMessages.length, 0);
  assert.equal(p.el['file-input'].value, '');
});

test('file: .docx is extracted via mammoth.extractRawText', { todo: 'BUG: popup.js calls mammoth.extractRawValue, which does not exist in vendor/mammoth.browser.min.js (only extractRawText) → every .docx upload fails' }, async () => {
  const mammoth = fakeMammoth('Word-Inhalt');
  const p = loadPopup({ mammoth });
  await p.upload(fakeFile('brief.docx', 'PK...'));
  assert.equal(mammoth.calls.length, 1);
  assert.ok('arrayBuffer' in mammoth.calls[0]);
  assert.equal(p.runtimeMessages[0]?.text, 'Word-Inhalt');
});

test('file: .docx currently fails with an error message (documents the extractRawValue bug)', async () => {
  const p = loadPopup({ mammoth: fakeMammoth('Word-Inhalt') });
  await p.upload(fakeFile('brief.docx', 'PK...'));
  assert.match(p.el['file-feedback'].textContent, /^Fehler: .*extractRawValue/);
  assert.equal(p.runtimeMessages.length, 0);
});

test('file: legacy .doc asks for .docx', async () => {
  const p = loadPopup();
  await p.upload(fakeFile('alt.doc', 'x'));
  assert.equal(p.el['file-feedback'].textContent, 'Bitte .docx verwenden (modernes Word-Format).');
  assert.equal(p.el['file-input'].value, '');
  assert.equal(p.runtimeMessages.length, 0);
});

test('file: unsupported extension is rejected', async () => {
  const p = loadPopup();
  await p.upload(fakeFile('bild.png', 'x'));
  assert.equal(p.el['file-feedback'].textContent, 'Nicht unterstütztes Format. Erlaubt: .txt, .docx, .pdf');
  assert.equal(p.el['file-feedback'].className, 'feedback error');
  assert.equal(p.el['file-input'].value, '');
});

test('file: exactly 10 MB loads without confirmation', async () => {
  const p = loadPopup();
  await p.upload(fakeFile('big.txt', 'text', { size: 10 * 1024 * 1024 }));
  assert.equal(p.confirms.length, 0);
  assert.equal(p.runtimeMessages.length, 1);
});

test('file: > 10 MB asks for confirmation with size in MB, proceeds when confirmed', async () => {
  const p = loadPopup({ confirmResult: true });
  await p.upload(fakeFile('big.txt', 'text', { size: 15.5 * 1024 * 1024 }));
  assert.equal(p.confirms.length, 1);
  assert.match(p.confirms[0], /15\.5 MB/);
  assert.equal(p.runtimeMessages.length, 1);
});

test('file: > 10 MB cancelled → nothing is read, input reset', async () => {
  const p = loadPopup({ confirmResult: false });
  await p.upload(fakeFile('big.txt', 'text', { size: 11 * 1024 * 1024 }));
  assert.equal(p.runtimeMessages.length, 0);
  assert.equal(p.el['file-input'].value, '');
  assert.equal(p.el['file-feedback'].hidden, true);
});

test('file: empty/whitespace-only file → "Datei enthält keinen lesbaren Text."', async () => {
  const p = loadPopup();
  await p.upload(fakeFile('leer.txt', '  \n '));
  assert.equal(p.el['file-feedback'].textContent, 'Datei enthält keinen lesbaren Text.');
  assert.equal(p.runtimeMessages.length, 0);
  assert.equal(p.closed, 0);
  assert.equal(p.el['file-input'].value, '');
});

test('file: read error is shown as "Fehler: Datei konnte nicht gelesen werden"', async () => {
  const p = loadPopup();
  p.FakeFileReader.failNext = true;
  await p.upload(fakeFile('kaputt.txt', 'x'));
  assert.equal(p.el['file-feedback'].textContent, 'Fehler: Datei konnte nicht gelesen werden');
  assert.equal(p.runtimeMessages.length, 0);
});
