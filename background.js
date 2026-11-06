// background.js — MV3 background (service worker in Chrome, event page in Firefox)
// No importScripts needed; uses chrome.* directly (async/await works in both Chrome and Firefox MV3)

// Pending text older than this is treated as stale and discarded.
const PENDING_TTL_MS = 5 * 60 * 1000;

// Register context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'speedreader-read',
    title: 'Mit SpeedReader lesen',
    contexts: ['selection'],
  });
  purgeStalePendingText();
});

// Browser start: drop anything left over from a previous session
chrome.runtime.onStartup?.addListener(() => {
  purgeStalePendingText();
});

// Context menu click: info.selectionText provided by the API directly — no content script needed
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'speedreader-read' && info.selectionText) {
    openReader(info.selectionText.trim());
  }
});

// Message listener — only accept messages from this extension's own pages and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender?.id !== chrome.runtime.id) return false;

  if (message.type === 'READ_TEXT' && message.text) {
    // Must await openReader so storePendingText completes before tab opens
    openReader(message.text).then(() => sendResponse({ ok: true }));
    return true; // async response — keep message channel open
  }

  if (message.type === 'READER_READY') {
    // Reader tab is ready — deliver the pending text
    getPendingText().then((text) => {
      clearPendingText();
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
    // Preferred: session storage (in memory, cleared on browser restart)
    await chrome.storage.session.set({ pendingText: payload });
    // Make sure no older copy lingers in local storage
    try { await chrome.storage.local.remove('pendingText'); } catch { /* ignore */ }
  } catch {
    // Fallback (e.g. text exceeds the session storage quota): local storage.
    // Bounded by PENDING_TTL_MS and removed as soon as the reader picks it up.
    await chrome.storage.local.set({ pendingText: payload });
  }
}

function isFresh(entry) {
  return Boolean(entry?.text) &&
    typeof entry.timestamp === 'number' &&
    Date.now() - entry.timestamp <= PENDING_TTL_MS;
}

async function getPendingText() {
  // Try session first, then local
  try {
    const r = await chrome.storage.session.get('pendingText');
    if (isFresh(r.pendingText)) return r.pendingText.text;
  } catch { /* session not available */ }
  const r = await chrome.storage.local.get('pendingText');
  return isFresh(r.pendingText) ? r.pendingText.text : null;
}

async function clearPendingText() {
  try { await chrome.storage.session.remove('pendingText'); } catch { /* ignore */ }
  try { await chrome.storage.local.remove('pendingText'); } catch { /* ignore */ }
}

async function purgeStalePendingText() {
  try {
    const r = await chrome.storage.local.get('pendingText');
    if (r.pendingText && !isFresh(r.pendingText)) await chrome.storage.local.remove('pendingText');
  } catch { /* ignore */ }
}
