// background.js — MV3 service worker
// No importScripts needed; uses chrome.* directly (async/await works in both Chrome and Firefox MV3)

// Register context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'speedreader-read',
    title: 'Mit SpeedReader lesen',
    contexts: ['selection'],
  });
});

// Context menu click: info.selectionText provided by the API directly — no content script needed
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'speedreader-read' && info.selectionText) {
    openReader(info.selectionText.trim());
  }
});

// Message listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'READ_TEXT' && message.text) {
    // Must await openReader so storePendingText completes before tab opens
    openReader(message.text).then(() => sendResponse({ ok: true }));
    return true; // async response — keep message channel open
  }

  if (message.type === 'READER_READY') {
    // Reader tab is ready — deliver the pending text
    getPendingText().then((text) => {
      if (text) clearPendingText();
      sendResponse({ text: text ?? null });
    });
    return true; // async response — keep channel open
  }
});

// ── Helpers ──

async function openReader(text) {
  await storePendingText(text);
  chrome.tabs.create({ url: chrome.runtime.getURL('reader/reader.html') });
}

async function storePendingText(text) {
  const payload = { text, timestamp: Date.now() };
  try {
    // Preferred: session storage (cleared on browser restart, not persisted)
    await chrome.storage.session.set({ pendingText: payload });
  } catch {
    // Fallback: local storage (persisted, but we delete it immediately after reader reads it)
    await chrome.storage.local.set({ pendingText: payload });
  }
}

async function getPendingText() {
  // Try session first, then local
  try {
    const r = await chrome.storage.session.get('pendingText');
    if (r.pendingText?.text) return r.pendingText.text;
  } catch { /* session not available */ }
  const r = await chrome.storage.local.get('pendingText');
  return r.pendingText?.text ?? null;
}

async function clearPendingText() {
  try { await chrome.storage.session.remove('pendingText'); } catch { /* ignore */ }
  try { await chrome.storage.local.remove('pendingText'); } catch { /* ignore */ }
}
