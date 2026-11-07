// popup/popup.js

// Hard limits — files above these are rejected, not just warned about.
const MAX_FILE_SIZE = 20 * 1024 * 1024;          // 20 MB on disk
const MAX_DOCX_UNCOMPRESSED = 50 * 1024 * 1024;  // 50 MB unpacked (.docx zip-bomb guard)

// Injected on demand into the active tab (path relative to the extension root).
const CONTENT_SCRIPT = 'content.js';

// DOM refs
const btnSelection      = document.getElementById('btn-selection');
const btnPicker         = document.getElementById('btn-picker');
const selectorInput     = document.getElementById('selector-input');
const btnSelector       = document.getElementById('btn-selector');
const selectorFeedback  = document.getElementById('selector-feedback');
const fileInput         = document.getElementById('file-input');
const fileLabel         = document.querySelector('.file-label');
const fileFeedback      = document.getElementById('file-feedback');
const globalStatus      = document.getElementById('global-status');

// pdf.js (ES module) is loaded and its worker path configured by pdf-loader.mjs,
// which exposes the API as the global `pdfjsLib`.

// ── Helpers ──

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Thrown when the browser refuses script injection (chrome://, about:, Web Store / addons.mozilla.org,
// built-in PDF viewer, other extensions' pages, …).
class RestrictedPageError extends Error {}

// No content script is registered globally: opening the popup grants activeTab for the current tab,
// and content.js is injected only now. content.js guards against running twice in the same page.
async function sendToContent(message) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('no-tab');
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [CONTENT_SCRIPT] });
  } catch (err) {
    throw new RestrictedPageError(err?.message);
  }
  return chrome.tabs.sendMessage(tab.id, message);
}

function showPageError(err) {
  showFeedback(
    globalStatus,
    err instanceof RestrictedPageError
      ? 'Auf dieser Seite nicht verfügbar (geschützte Browser-Seite).'
      : 'Seite nicht zugänglich.',
    'error'
  );
}

function showFeedback(el, msg, type) {
  el.textContent = msg;
  el.className = `feedback ${type}`;
  el.hidden = false;
}

function clearFeedback(el) {
  el.hidden = true;
  el.textContent = '';
  el.className = 'feedback';
}

// ── Web section ──

btnSelection.addEventListener('click', async () => {
  clearFeedback(globalStatus);
  try {
    const resp = await sendToContent({ type: 'READ_SELECTION' });
    if (resp?.error === 'EMPTY') {
      showFeedback(globalStatus, 'Kein Text ausgewählt.', 'error');
    } else {
      window.close();
    }
  } catch (err) {
    showPageError(err);
  }
});

btnPicker.addEventListener('click', async () => {
  clearFeedback(globalStatus);
  try {
    await sendToContent({ type: 'ACTIVATE_PICKER' });
    window.close();
  } catch (err) {
    showPageError(err);
  }
});

btnSelector.addEventListener('click', loadBySelector);
selectorInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadBySelector(); });

async function loadBySelector() {
  const selector = selectorInput.value.trim();
  if (!selector) return;
  clearFeedback(selectorFeedback);
  selectorInput.classList.remove('error');
  try {
    const resp = await sendToContent({ type: 'USE_SELECTOR', selector });
    if (resp?.error === 'NOT_FOUND') {
      selectorInput.classList.add('error');
      showFeedback(selectorFeedback, 'Element nicht gefunden.', 'error');
    } else if (resp?.error === 'EMPTY') {
      showFeedback(selectorFeedback, 'Element enthält keinen Text.', 'error');
    } else {
      window.close();
    }
  } catch (err) {
    showPageError(err);
  }
}

// ── File section ──

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  clearFeedback(fileFeedback);

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'doc') {
    showFeedback(fileFeedback, 'Bitte .docx verwenden (modernes Word-Format).', 'error');
    fileInput.value = '';
    return;
  }

  if (!['txt', 'docx', 'pdf'].includes(ext)) {
    showFeedback(fileFeedback, 'Nicht unterstütztes Format. Erlaubt: .txt, .docx, .pdf', 'error');
    fileInput.value = '';
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    showFeedback(
      fileFeedback,
      `Datei zu groß (${formatMb(file.size)} MB). Maximal ${formatMb(MAX_FILE_SIZE)} MB erlaubt.`,
      'error'
    );
    fileInput.value = '';
    return;
  }

  showFeedback(fileFeedback, 'Wird geladen…', '');

  try {
    const text = await parseFile(file, ext);
    if (!text.trim()) {
      showFeedback(fileFeedback, 'Datei enthält keinen lesbaren Text.', 'error');
      return;
    }
    chrome.runtime.sendMessage({ type: 'READ_TEXT', text });
    window.close();
  } catch (err) {
    showFeedback(fileFeedback, 'Fehler: ' + err.message, 'error');
  } finally {
    fileInput.value = '';
  }
});

async function parseFile(file, ext) {
  if (ext === 'txt') {
    return readAsText(file);
  }
  if (ext === 'docx') {
    const buf = await readAsArrayBuffer(file);
    // getZipUncompressedSize: popup/zip-guard.js
    const unpacked = getZipUncompressedSize(buf);
    if (unpacked > MAX_DOCX_UNCOMPRESSED) {
      throw new Error(
        `.docx ist entpackt zu groß (${formatMb(unpacked)} MB, max. ${formatMb(MAX_DOCX_UNCOMPRESSED)} MB)`
      );
    }
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value;
  }
  if (ext === 'pdf') {
    const buf = await readAsArrayBuffer(file);
    return extractPdfText(buf);
  }
  throw new Error('Unbekanntes Format');
}

function formatMb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    r.readAsText(file, 'UTF-8');
  });
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    r.readAsArrayBuffer(file);
  });
}

async function extractPdfText(arrayBuffer) {
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF-Bibliothek nicht geladen');
  // isEvalSupported: false — never compile font code via eval/new Function (defense in depth).
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, isEvalSupported: false }).promise;
  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map(item => item.str).join(' '));
  }
  const text = pageTexts.join('\n\n');
  if (!text.trim()) throw new Error('PDF enthält keinen extrahierbaren Text (evtl. Scan-PDF)');
  return text;
}
