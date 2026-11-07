// tests/popup.test.mjs — popup/popup.js against a fake DOM, chrome API and vendor libs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPopup, fakeFile, fakePdfjs, fakeMammoth } from './helpers/fake-popup-dom.mjs';
import { buildZip } from './helpers/zip-builder.mjs';

const plain = (o) => JSON.parse(JSON.stringify(o));

// ── Setup ──

// Worker configuration moved to popup/pdf-loader.mjs (pdf.js ≥ 4 is ESM-only); covered by manifest.test.mjs.
test('popup.js leaves the pdf.js worker path to the module shim', () => {
  const p = loadPopup();
  assert.equal(p.pdfjsLib.GlobalWorkerOptions.workerSrc, '');
});

test('loads without pdfjsLib present', () => {
  assert.doesNotThrow(() => loadPopup({ pdfjsLib: null }));
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

// ── On-demand injection (activeTab + scripting) ──

test('every page action first injects content.js into the active tab, then messages it', async () => {
  for (const act of [
    (p) => p.el['btn-selection'].fire('click'),
    (p) => p.el['btn-picker'].fire('click'),
    (p) => { p.el['selector-input'].value = 'article'; return p.el['btn-selector'].fire('click'); },
  ]) {
    const p = loadPopup();
    await act(p);
    assert.deepEqual(plain(p.injections), [{ target: { tabId: 7 }, files: ['content.js'] }]);
    assert.deepEqual(p.calls, ['inject', 'message']);
  }
});

test('restricted page (injection refused) → specific error, no message sent, popup stays open', async () => {
  const restricted = 'Auf dieser Seite nicht verfügbar (geschützte Browser-Seite).';
  for (const act of [
    (p) => p.el['btn-selection'].fire('click'),
    (p) => p.el['btn-picker'].fire('click'),
    (p) => { p.el['selector-input'].value = 'article'; return p.el['btn-selector'].fire('click'); },
  ]) {
    const p = loadPopup({ injectError: new Error('Cannot access a chrome:// URL') });
    await act(p);
    assert.equal(p.el['global-status'].textContent, restricted);
    assert.equal(p.el['global-status'].hidden, false);
    assert.equal(p.tabMessages.length, 0);
    assert.equal(p.closed, 0);
  }
});

test('no active tab → nothing is injected', async () => {
  const p = loadPopup({ tab: null });
  await p.el['btn-picker'].fire('click');
  assert.equal(p.injections.length, 0);
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
  assert.equal(pdfjsLib.calls[0].isEvalSupported, false);
  assert.equal(p.closed, 1);
});

test('file: .pdf while the pdf.js module has not loaded reports an error', async () => {
  const p = loadPopup({ pdfjsLib: null });
  await p.upload(fakeFile('doc.pdf', '%PDF-1.7'));
  assert.match(p.el['file-feedback'].textContent, /PDF-Bibliothek nicht geladen/);
  assert.equal(p.runtimeMessages.length, 0);
});

test('file: .pdf without extractable text reports scan-PDF error', async () => {
  const p = loadPopup({ pdfjsLib: fakePdfjs([[' '], []]) });
  await p.upload(fakeFile('scan.pdf', '%PDF'));
  assert.match(p.el['file-feedback'].textContent, /^Fehler: PDF enthält keinen extrahierbaren Text/);
  assert.equal(p.runtimeMessages.length, 0);
  assert.equal(p.el['file-input'].value, '');
});

const smallDocx = () => buildZip([{ name: 'word/document.xml', data: '<w:document/>' }]);

test('file: .docx is extracted via mammoth.extractRawText', async () => {
  const mammoth = fakeMammoth('Word-Inhalt');
  const p = loadPopup({ mammoth });
  await p.upload(fakeFile('brief.docx', smallDocx()));
  assert.equal(mammoth.calls.length, 1);
  assert.ok('arrayBuffer' in mammoth.calls[0]);
  assert.equal(p.runtimeMessages[0]?.text, 'Word-Inhalt');
  assert.equal(p.closed, 1);
});

test('file: .docx unpacking to exactly 50 MB is still accepted', async () => {
  const mammoth = fakeMammoth('ok');
  const p = loadPopup({ mammoth });
  const zip = buildZip([{ name: 'word/document.xml', data: 'x', declaredSize: 50 * 1024 * 1024 }]);
  await p.upload(fakeFile('grenze.docx', zip));
  assert.equal(mammoth.calls.length, 1);
});

test('file: .docx zip bomb (> 50 MB unpacked) is rejected before mammoth runs', async () => {
  const mammoth = fakeMammoth('nie');
  const p = loadPopup({ mammoth });
  const bomb = buildZip([{ name: 'word/document.xml', data: new Uint8Array(60 * 1024 * 1024) }]);
  await p.upload(fakeFile('bombe.docx', bomb));
  assert.equal(mammoth.calls.length, 0);
  assert.equal(p.el['file-feedback'].textContent, 'Fehler: .docx ist entpackt zu groß (60.0 MB, max. 50.0 MB)');
  assert.equal(p.runtimeMessages.length, 0);
  assert.equal(p.el['file-input'].value, '');
});

test('file: .docx that is not a ZIP archive is rejected with a clear message', async () => {
  const mammoth = fakeMammoth('nie');
  const p = loadPopup({ mammoth });
  await p.upload(fakeFile('kaputt.docx', 'PK... not a zip'));
  assert.equal(mammoth.calls.length, 0);
  assert.match(p.el['file-feedback'].textContent, /^Fehler: Ungültige \.docx-Datei/);
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

test('file: exactly 20 MB loads (limit is inclusive) without any confirm dialog', async () => {
  const p = loadPopup();
  await p.upload(fakeFile('big.txt', 'text', { size: 20 * 1024 * 1024 }));
  assert.equal(p.confirms.length, 0);
  assert.equal(p.runtimeMessages.length, 1);
});

test('file: > 20 MB is rejected hard with size in MB, nothing is read', async () => {
  const p = loadPopup({ confirmResult: true });
  await p.upload(fakeFile('big.pdf', '%PDF', { size: 25.5 * 1024 * 1024 }));
  assert.equal(p.confirms.length, 0, 'no confirm() bypass any more');
  assert.equal(p.el['file-feedback'].textContent, 'Datei zu groß (25.5 MB). Maximal 20.0 MB erlaubt.');
  assert.equal(p.el['file-feedback'].className, 'feedback error');
  assert.equal(p.pdfjsLib.calls.length, 0);
  assert.equal(p.runtimeMessages.length, 0);
  assert.equal(p.el['file-input'].value, '');
});

test('file: size limit applies to every format (.docx just above 20 MB)', async () => {
  const mammoth = fakeMammoth('nie');
  const p = loadPopup({ mammoth });
  await p.upload(fakeFile('gross.docx', smallDocx(), { size: 20 * 1024 * 1024 + 1 }));
  assert.equal(mammoth.calls.length, 0);
  assert.match(p.el['file-feedback'].textContent, /^Datei zu groß/);
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
