// tests/helpers/fake-chrome.mjs
// Minimal in-memory stand-in for the chrome.* APIs used by background.js and content.js.

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(fn) { listeners.push(fn); },
    dispatch(...args) { return listeners.map((fn) => fn(...args)); },
  };
}

function createStorageArea({ broken = false } = {}) {
  const data = {};
  const guard = () => { if (broken) throw new Error('storage area unavailable'); };
  return {
    data,
    async set(items) { guard(); Object.assign(data, structuredClone(items)); },
    async get(key) { guard(); return key in data ? { [key]: structuredClone(data[key]) } : {}; },
    async remove(key) { guard(); delete data[key]; },
  };
}

export function createFakeChrome({ sessionBroken = false } = {}) {
  const createdTabs = [];
  const createdMenus = [];
  const sentMessages = [];
  return {
    createdTabs,
    createdMenus,
    sentMessages,
    runtime: {
      onInstalled: createEvent(),
      onMessage: createEvent(),
      getURL: (path) => `chrome-extension://test-id/${path}`,
      sendMessage: (msg) => { sentMessages.push(msg); },
    },
    contextMenus: {
      onClicked: createEvent(),
      create: (opts) => { createdMenus.push(opts); },
    },
    tabs: {
      create: (opts) => { createdTabs.push(opts); },
    },
    storage: {
      session: createStorageArea({ broken: sessionBroken }),
      local: createStorageArea(),
    },
  };
}

/**
 * Dispatch a runtime message the way Chrome does and resolve with the
 * value passed to sendResponse (or undefined if the listener answered synchronously
 * without responding).
 */
export function sendRuntimeMessage(chrome, message) {
  return new Promise((resolve) => {
    let keepOpen = false;
    for (const fn of chrome.runtime.onMessage.listeners) {
      const ret = fn(message, {}, resolve);
      if (ret === true) keepOpen = true;
    }
    if (!keepOpen) setTimeout(() => resolve(undefined), 0);
  });
}
