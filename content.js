// content.js — injected into every page
// Handles: element picker, CSS selector, and selection-button message

let pickerActive = false;
let hoveredEl = null;
const OUTLINE = '2px solid #4a90e2';

function enterPicker() {
  pickerActive = true;
  document.body.style.cursor = 'crosshair';
}

function exitPicker() {
  pickerActive = false;
  document.body.style.cursor = '';
  if (hoveredEl) {
    hoveredEl.style.outline = '';
    hoveredEl = null;
  }
}

// Hover: highlight element under cursor
document.addEventListener('mouseover', (e) => {
  if (!pickerActive) return;
  if (hoveredEl) hoveredEl.style.outline = '';
  hoveredEl = e.target;
  hoveredEl.style.outline = OUTLINE;
}, { capture: true });

// Click: extract text from picked element
document.addEventListener('click', (e) => {
  if (!pickerActive) return;
  e.preventDefault();
  e.stopPropagation();
  const text = (e.target.innerText || '').trim();
  exitPicker();
  if (text) {
    chrome.runtime.sendMessage({ type: 'READ_TEXT', text });
  }
}, { capture: true });

// Escape key: cancel picker
document.addEventListener('keydown', (e) => {
  if (pickerActive && e.key === 'Escape') exitPicker();
});

// Brief highlight helper for CSS selector feedback
function flashElement(el) {
  const prev = el.style.outline;
  el.style.outline = OUTLINE;
  setTimeout(() => { el.style.outline = prev; }, 800);
}

// Message handler from popup.js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'ACTIVATE_PICKER') {
    enterPicker();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'USE_SELECTOR') {
    let el;
    try { el = document.querySelector(message.selector); } catch { /* invalid selector */ }
    if (!el) {
      sendResponse({ error: 'NOT_FOUND' });
      return false;
    }
    const text = (el.innerText || '').trim();
    flashElement(el);
    if (!text) {
      sendResponse({ error: 'EMPTY' });
      return false;
    }
    chrome.runtime.sendMessage({ type: 'READ_TEXT', text });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'READ_SELECTION') {
    const text = (window.getSelection()?.toString() || '').trim();
    if (!text) {
      sendResponse({ error: 'EMPTY' });
      return false;
    }
    chrome.runtime.sendMessage({ type: 'READ_TEXT', text });
    sendResponse({ ok: true });
    return false;
  }
});
