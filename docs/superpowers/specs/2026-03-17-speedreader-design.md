# SpeedReader Browser Extension — Design Spec

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

SpeedReader is a cross-browser extension (Chrome/Firefox) that enables RSVP-based (Rapid Serial Visual Presentation) speed reading. Text is presented word by word in a dedicated browser tab. Each word is centered on its Optimal Recognition Point (ORP) — a highlighted letter at ~30% of the word length — so the eye does not need to move and reading speed increases significantly.

**Language:** UI strings are in German only. No i18n system — strings are hardcoded.

---

## Goals

- Display words one at a time at an adjustable speed (WPM)
- Highlight the ORP letter per word for fast recognition
- Support multiple text sources: web page selection, element picker, CSS selector, and local file upload (.txt, .docx, .pdf)
- Cross-browser: Chrome/Chromium + Firefox (Manifest V3)
- No build step, no npm — pure Vanilla JS, ES Modules

---

## Non-Goals

- OCR / scanned PDFs
- `.doc` (legacy Word format) — only `.docx`
- Text-to-speech / audio
- Cloud sync of reading progress
- Web App variant (possible future port, not in scope)
- i18n / localization

---

## Architecture

### Project Structure

```
speedreader/
├── manifest.json                  # MV3, permissions, content/background scripts
├── background.js                  # Service Worker: opens reader tab, message routing
├── content.js                     # Injected into pages: picker mode, selection listener
├── popup/
│   ├── popup.html                 # File upload + CSS selector input + trigger buttons
│   ├── popup.js
│   └── popup.css
├── reader/
│   ├── reader.html                # Full-tab RSVP reader UI
│   ├── reader-core.js             # Pure module: Tokenizer, ORP calc — no side effects, testable
│   ├── reader.js                  # Entry point: reads storage, wires up UI, starts loop
│   └── reader.css
├── vendor/
│   ├── browser-polyfill.min.js    # Mozilla WebExtension polyfill (chrome.* compat)
│   ├── pdf.min.js                 # pdf.js for PDF text extraction
│   └── mammoth.browser.min.js     # mammoth.js for .docx parsing
├── tests/
│   └── reader-logic.html          # Unit tests: loads reader-core.js, asserts via console.assert()
└── docs/
    ├── testing.md                 # Manual smoke test checklist (created during implementation)
    └── superpowers/specs/
        └── 2026-03-17-speedreader-design.md
```

### Data Flow

1. User triggers one of four text sources (see Text Extraction below)
2. `content.js` or `popup.js` extracts raw plain text
3. Text is sent to `background.js` via `chrome.runtime.sendMessage({ type: "READ_TEXT", text })`
4. Background writes text to `chrome.storage.session` under key `"pendingText"`, then opens `reader/reader.html`
5. `reader.js` (the entry point in the new tab) sends a `{ type: "READER_READY" }` message to background once the page is loaded
6. Background responds with the text (or `reader.js` reads from storage directly after receiving the ready-ack)
7. `reader.js` calls `reader-core.js` to tokenize, then starts the RSVP loop

**Race condition mitigation:** `reader.js` always sends `READER_READY` on `DOMContentLoaded`. Background either responds immediately (if text is already stored) or stores the text and the ready flag together. If storage is empty when `READER_READY` fires, `reader.js` shows an error state (see Error Handling).

---

## Components

### manifest.json

```json
{
  "manifest_version": 3,
  "permissions": ["contextMenus", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["vendor/browser-polyfill.min.js", "content.js"]
    }
  ],
  "action": { "default_popup": "popup/popup.html" }
}
```

`"scripting"` and `"activeTab"` permissions are **not** needed — `content.js` is always injected via `content_scripts` with `"<all_urls>"`. `chrome.tabs.sendMessage` works without additional permissions once the content script is injected. `chrome.tabs.query({ active: true, currentWindow: true })` also works without the `"tabs"` permission for basic active-tab lookup.

### background.js

- Registers context menu entry: "Mit SpeedReader lesen"
- `chrome.contextMenus.onClicked`: uses `info.selectionText` directly (provided by the API) — no content script involvement needed for this path. Calls the shared `openReader(text)` helper.
- `openReader(text)` helper (internal):
  1. Stores `{ text, timestamp }` in `chrome.storage.session` under key `"pendingText"` (fallback: `chrome.storage.local`)
  2. Opens `reader/reader.html` in a new tab
- On message `{ type: "READ_TEXT", text }` from content.js or popup.js: calls `openReader(text)`
- On message `{ type: "READER_READY" }` from the reader tab:
  - Reads `"pendingText"` from storage, responds with `{ type: "TEXT_PAYLOAD", text }`, clears key from storage
- **Storage cleanup:** on each `READ_TEXT` message, any existing `"pendingText"` key is overwritten. If the reader tab was closed before reading, the stale key is replaced on the next use, preventing storage accumulation.

### content.js

Always-on injection (via `content_scripts`). Handles:

1. **Selected text (via context menu)** — handled entirely in `background.js` via `info.selectionText`; content.js is not involved in this path
2. **Element picker** — activated by message `{ type: "ACTIVATE_PICKER" }` from popup; hover highlights elements with blue CSS outline; click extracts `element.innerText`, sends `READ_TEXT` to background, deactivates picker
3. **CSS selector** — on message `{ type: "USE_SELECTOR", selector }` from popup: runs `document.querySelector(selector).innerText`, briefly highlights matched element, sends `READ_TEXT` to background; on no match sends `{ type: "SELECTOR_ERROR" }` back to popup
4. **Selection button** — on message `{ type: "READ_SELECTION" }` from popup: calls `window.getSelection().toString()`, sends `{ type: "READ_TEXT", text }` to background; if selection is empty sends `{ type: "SELECTION_EMPTY" }` back to popup

### popup/popup.js

popup.js resolves the active tab ID via `chrome.tabs.query({ active: true, currentWindow: true })` and uses `chrome.tabs.sendMessage(tabId, ...)` to reach `content.js` directly — **not** via background.

- **File upload** — accepts `.txt`, `.docx`, `.pdf`; parsing happens in `popup.js` using vendor libs loaded in `popup.html` (not in background.js — `chrome.runtime.sendMessage` cannot transfer `ArrayBuffer` via JSON serialization):
  - popup.js checks file size first: if >10 MB, shows inline warning "Datei sehr groß – Laden kann dauern" and waits for user confirmation before proceeding
  - `.txt` → `FileReader.readAsText()`
  - `.docx` → `mammoth.extractRawValue(arrayBuffer)` (mammoth loaded in popup.html)
  - `.pdf` → `pdfjsLib.getDocument(arrayBuffer)` → iterate pages → `page.getTextContent()` (pdf.js loaded in popup.html)
  - Extracted plain text string is sent to background via `chrome.runtime.sendMessage({ type: "READ_TEXT", text })`
  - Trade-off: if the popup is dismissed during a long parse, the operation is aborted. Acceptable given file parsing is typically fast for normal document sizes.
- **CSS selector input** — text field; "Laden" button calls `chrome.tabs.sendMessage(tabId, { type: "USE_SELECTOR", selector })`
- **Picker button** — calls `chrome.tabs.sendMessage(tabId, { type: "ACTIVATE_PICKER" })`
- **Selection button** — calls `chrome.tabs.sendMessage(tabId, { type: "READ_SELECTION" })`

### reader/reader-core.js — Pure Logic Module

No DOM access, no `chrome.*` calls. Importable in both reader.html and tests/reader-logic.html.

**Tokenizer:**
- Split on whitespace, strip leading/trailing punctuation per token
- Detect sentence endings (`.`, `!`, `?`) → apply 2× pause after that word
- Words >10 characters → 1.4× normal duration
- Returns array of `{ word, pauseMultiplier }` objects

**ORP Calculation:**
```js
export function getOrpIndex(word) {
  return Math.max(0, Math.floor(word.length * 0.3) - 1);
}
```

Edge cases:
- 1-char word: index = 0 → `.before` is empty string, `.orp` = the single char, `.after` is empty string
- 2-char word: index = 0 → `.before` is empty, `.orp` = first char, `.after` = second char
- Empty `.before` or `.after` spans are rendered as empty `<span>` elements (no visual artifact)

### reader/reader.js — Entry Point

On `DOMContentLoaded`:
1. Sends `{ type: "READER_READY" }` to background via `chrome.runtime.sendMessage`
2. On response `{ type: "TEXT_PAYLOAD", text }`: calls `reader-core.js` to tokenize, wires up controls, starts loop
3. On empty/missing text: shows error state "Kein Text empfangen — bitte erneut versuchen"

**Rendering (per word):**
Three `<span>` elements inside a fixed-width display container:
- `.before` — letters before ORP (muted gray)
- `.orp` — ORP letter (orange, bold, fixed horizontal position via CSS `text-align` trick)
- `.after` — letters after ORP (muted gray)

The ORP character is always at the same x-position — the eye is stationary.

**Timing Loop:**
```js
interval = 60000 / wpm * pauseMultiplier  // ms per word
```
Uses `setTimeout` chain (not `setInterval`) for accurate per-word timing.
WPM slider changes apply **from the next word** — the current pending `setTimeout` fires at the old interval, then the new WPM takes effect.

**Controls:**
- Play / Pause (also Spacebar)
- Restart
- WPM Slider (100–800, step 50, default 250) — adjustable during playback; change takes effect from next word
- Progress counter: `Wort 42 / 318`
- End of text: auto-pause, show "Fertig" banner with "Neu starten" button

---

## Cross-Browser Compatibility

- **Manifest V3** for both Chrome and Firefox (FF109+)
- `vendor/browser-polyfill.min.js` normalizes `chrome.*` vs `browser.*` — all code uses `chrome.*`
- `chrome.storage.session` is available in Chrome 102+ and Firefox 115+. The browser-polyfill wraps the existing API but does not polyfill missing APIs — if `chrome.storage.session` is unavailable, the extension falls back to `chrome.storage.local` with a short-lived key (deleted immediately after the reader tab reads it). This fallback is implemented in background.js: try `storage.session`, catch `undefined`/error, fall back to `storage.local`.
- No build step required; distribution package = ZIP of project folder

---

## Error Handling

| Situation | Behavior |
|---|---|
| Empty selection | Toast in popup (German): "Kein Text ausgewählt" |
| CSS selector matches nothing | Popup feedback: "Element nicht gefunden", selector input highlighted red |
| PDF is scan-only (no text layer) | Error in reader: "PDF enthält keinen extrahierbaren Text" |
| `.doc` file uploaded | Error in popup: "Bitte .docx verwenden (modernes Word-Format)" |
| File >10 MB | Warning before parse: "Datei sehr groß – Laden kann dauern" |
| Text <5 words | Show all words at once without loop |
| Emoji / special chars | Treated as single token, no crash |
| Tab closed before text arrives | Background clears `pendingText` from storage, no error shown |
| Reader tab opened directly (no text in storage) | Reader shows: "Kein Text empfangen — bitte erneut versuchen" |
| Popup dismissed during file parse | Parse is aborted (popup context is destroyed); user must reopen popup and re-select the file |

---

## Testing

- **`reader-core.js`** is a pure ES module with no side effects — can be imported into `tests/reader-logic.html` directly
- **Unit tests** in `tests/reader-logic.html`: loads `reader-core.js`, tests tokenizer output and ORP index calculation via `console.assert()`
- **Manual smoke test checklist**: `docs/testing.md`
- No automated browser tests (YAGNI)

---

## Open Questions / Future

- Word-grouping mode (2–3 words at once) — possible future feature
- Progress persistence across sessions — possible via `chrome.storage.local`
- Web App port — same reader-core.js, different entry point
