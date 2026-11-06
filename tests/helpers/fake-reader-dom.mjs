// tests/helpers/fake-reader-dom.mjs
// Loads reader/reader.js (an ES module) against a minimal fake DOM + chrome.runtime.
// Each call imports a fresh module instance via a cache-busting query string.

const IDS = [
  'word-before', 'word-orp', 'word-after', 'word-index', 'word-total',
  'btn-playpause', 'btn-restart', 'wpm-slider', 'wpm-display',
  'done-banner', 'error-banner', 'controls', 'btn-done-restart',
];

// Initial state mirrors reader/reader.html
const INITIAL = {
  'word-index': { textContent: '–' },
  'word-total': { textContent: '–' },
  'btn-playpause': { textContent: '▶', tagName: 'BUTTON' },
  'btn-restart': { tagName: 'BUTTON' },
  'btn-done-restart': { tagName: 'BUTTON' },
  'wpm-slider': { value: '250', tagName: 'INPUT' },
  'wpm-display': { textContent: '250' },
  'done-banner': { hidden: true },
  'error-banner': { hidden: true },
};

function fakeElement(id) {
  const listeners = {};
  return {
    id,
    tagName: 'SPAN',
    textContent: '',
    hidden: false,
    value: '',
    ...INITIAL[id],
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    dispatch(type, event = {}) { for (const fn of listeners[type] ?? []) fn({ target: this, ...event }); },
    click() { this.dispatch('click'); },
  };
}

let loadCounter = 0;

export async function loadReader() {
  const elements = Object.fromEntries(IDS.map((id) => [id, fakeElement(id)]));
  const docListeners = {};
  const body = { tagName: 'BODY' };

  const document = {
    body,
    getElementById: (id) => elements[id] ?? null,
    addEventListener(type, fn) { (docListeners[type] ??= new Set()).add(fn); },
    removeEventListener(type, fn) { docListeners[type]?.delete(fn); },
  };

  let readyCallback = null;
  const sentMessages = [];
  const chrome = {
    runtime: {
      lastError: undefined,
      sendMessage(message, callback) {
        sentMessages.push(message);
        readyCallback = callback;
      },
    },
  };

  globalThis.document = document;
  globalThis.chrome = chrome;
  await import(`../../reader/reader.js?instance=${++loadCounter}`);

  const el = (id) => elements[id];
  return {
    el,
    chrome,
    sentMessages,
    /** Answer the READER_READY request the way background.js would. */
    respond(response, { lastError } = {}) {
      chrome.runtime.lastError = lastError;
      readyCallback(response);
      chrome.runtime.lastError = undefined;
    },
    /** Dispatch a keydown on the document; returns whether preventDefault was called. */
    keydown(code, target = body) {
      let prevented = false;
      const event = { code, target, preventDefault: () => { prevented = true; } };
      for (const fn of docListeners.keydown ?? []) fn(event);
      return prevented;
    },
    setWpm(value) {
      elements['wpm-slider'].value = String(value);
      elements['wpm-slider'].dispatch('input');
    },
    /** Currently displayed word, reassembled from the ORP parts. */
    word: () => el('word-before').textContent + el('word-orp').textContent + el('word-after').textContent,
    progress: () => `${el('word-index').textContent} / ${el('word-total').textContent}`,
  };
}

export function cleanupReaderGlobals() {
  delete globalThis.document;
  delete globalThis.chrome;
}
