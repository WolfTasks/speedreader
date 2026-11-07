// tests/helpers/fake-popup-dom.mjs
// Fake DOM, chrome API, FileReader and vendor globals for running popup/popup.js in a vm context.

import { loadScript, flush } from './load-script.mjs';

function fakeElement(id) {
  const listeners = {};
  const classes = new Set();
  return {
    id,
    hidden: true,
    textContent: '',
    className: '',
    value: '',
    files: [],
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    async fire(type, event = {}) {
      await Promise.all((listeners[type] ?? []).map((fn) => fn(event)));
      await settle();
    },
  };
}

/** Let chained promises (FileReader → parse → feedback) run to completion. */
export async function settle() {
  for (let i = 0; i < 10; i++) await flush();
}

/** A File-like object; content is a string (txt) or arbitrary bytes marker. */
export function fakeFile(name, content = '', { size } = {}) {
  return { name, content, size: size ?? content.length };
}

class FakeFileReader {
  static failNext = false;
  readAsText(file, encoding) {
    this.encoding = encoding;
    this.#finish(file.content);
  }
  readAsArrayBuffer(file) {
    const bytes = file.content instanceof Uint8Array ? file.content : new TextEncoder().encode(file.content);
    this.#finish(bytes.slice().buffer);
  }
  #finish(result) {
    setTimeout(() => {
      if (FakeFileReader.failNext) {
        FakeFileReader.failNext = false;
        this.onerror?.();
      } else {
        this.result = result;
        this.onload?.();
      }
    }, 0);
  }
}

/** pdfjsLib stand-in: pages is an array of arrays of text-item strings. */
export function fakePdfjs(pages = []) {
  const lib = {
    GlobalWorkerOptions: { workerSrc: '' },
    calls: [],
    getDocument(opts) {
      lib.calls.push(opts);
      return {
        promise: Promise.resolve({
          numPages: pages.length,
          getPage: async (i) => ({
            getTextContent: async () => ({ items: pages[i - 1].map((str) => ({ str })) }),
          }),
        }),
      };
    },
  };
  return lib;
}

/** mammoth stand-in exposing the real library's API surface (extractRawText). */
export function fakeMammoth(text = '') {
  const lib = {
    calls: [],
    async extractRawText(opts) { lib.calls.push(opts); return { value: text, messages: [] }; },
  };
  return lib;
}

/**
 * Load popup.js with fakes. contentResponse: value or function(message) returned by
 * chrome.tabs.sendMessage; set tab to null to simulate no active tab.
 * injectError: Error thrown by chrome.scripting.executeScript (restricted page).
 * pdfjsLib: null = global absent (pdf-loader.mjs module not loaded yet).
 */
export function loadPopup({
  contentResponse = { ok: true },
  tab = { id: 7 },
  pdfjsLib = fakePdfjs(),
  mammoth = fakeMammoth(),
  confirmResult = true,
  injectError = null,
} = {}) {
  const ids = [
    'btn-selection', 'btn-picker', 'selector-input', 'btn-selector',
    'selector-feedback', 'file-input', 'file-feedback', 'global-status',
  ];
  const el = Object.fromEntries(ids.map((id) => [id, fakeElement(id)]));
  const fileLabel = fakeElement('file-label');

  const tabMessages = [];
  const injections = [];
  const calls = []; // ordered log of 'inject' / 'message'
  const runtimeMessages = [];
  const confirms = [];
  let closed = 0;

  const chrome = {
    runtime: {
      getURL: (p) => `chrome-extension://test-id/${p}`,
      sendMessage: (m) => { runtimeMessages.push(m); },
    },
    tabs: {
      query: async () => (tab ? [tab] : []),
      sendMessage: async (tabId, message) => {
        calls.push('message');
        tabMessages.push({ tabId, message });
        return typeof contentResponse === 'function' ? contentResponse(message) : contentResponse;
      },
    },
    scripting: {
      executeScript: async (details) => {
        calls.push('inject');
        injections.push(details);
        if (injectError) throw injectError;
        return [{ frameId: 0, result: undefined }];
      },
    },
  };

  const document = {
    getElementById: (id) => el[id] ?? null,
    querySelector: (sel) => (sel === '.file-label' ? fileLabel : null),
  };
  const window = {
    close: () => { closed++; },
    confirm: (msg) => { confirms.push(msg); return confirmResult; },
  };

  // popup.html loads zip-guard.js before popup.js; expose its global the same way.
  const { getZipUncompressedSize } = loadScript('popup/zip-guard.js', {});
  loadScript('popup/popup.js', {
    chrome, document, window, FileReader: FakeFileReader, TextEncoder, mammoth, getZipUncompressedSize,
    ...(pdfjsLib === null ? {} : { pdfjsLib }),
  });

  return {
    el,
    chrome,
    pdfjsLib,
    mammoth,
    tabMessages,
    injections,
    calls,
    runtimeMessages,
    confirms,
    get closed() { return closed; },
    FakeFileReader,
    async upload(file) {
      el['file-input'].files = [file];
      el['file-input'].value = `C:\\fakepath\\${file.name}`;
      await el['file-input'].fire('change');
    },
  };
}
