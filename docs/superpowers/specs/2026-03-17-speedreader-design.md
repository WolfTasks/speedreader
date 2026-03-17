# SpeedReader Browser Extension — Design Spec

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

SpeedReader is a cross-browser extension (Chrome/Firefox) that enables RSVP-based (Rapid Serial Visual Presentation) speed reading. Text is presented word by word in a dedicated browser tab. Each word is centered on its Optimal Recognition Point (ORP) — a highlighted letter at ~30% of the word length — so the eye does not need to move and reading speed increases significantly.

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
│   ├── reader.js                  # Tokenizer, ORP calc, timing loop, controls
│   └── reader.css
├── vendor/
│   ├── browser-polyfill.min.js    # Mozilla WebExtension polyfill (chrome.* compat)
│   ├── pdf.min.js                 # pdf.js for PDF text extraction
│   └── mammoth.browser.min.js    # mammoth.js for .docx parsing
└── docs/
    └── superpowers/specs/
        └── 2026-03-17-speedreader-design.md
```

### Data Flow

1. User triggers one of four text sources (see Text Extraction below)
2. `content.js` or `popup.js` extracts raw plain text
3. Text is sent to `background.js` via `chrome.runtime.sendMessage`
4. Background stores text in `chrome.storage.session`, opens `reader/reader.html` in a new tab
5. `reader.js` reads from storage, tokenizes, starts the RSVP loop

---

## Components

### manifest.json

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "contextMenus", "storage", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["vendor/browser-polyfill.min.js", "content.js"] }],
  "action": { "default_popup": "popup/popup.html" }
}
```

### background.js

- Registers context menu entry: "Speed Read selection"
- On message `{ type: "READ_TEXT", text: "..." }`: stores text in `chrome.storage.session`, opens `reader/reader.html`
- Fallback for short texts (<2000 chars): passes text as URL param instead of storage

### content.js

Injected into every page. Handles:

1. **Selected text** — context menu click or icon click extracts `window.getSelection().toString()`
2. **Element picker** — activated by popup button; hover highlights elements with blue outline; click extracts `element.innerText`, deactivates picker
3. **CSS selector** — receives selector from popup via `chrome.runtime.sendMessage`, runs `document.querySelector(selector).innerText`, briefly highlights matched element

### popup/

- **File upload** — accepts `.txt`, `.docx`, `.pdf`; parses client-side (no server needed):
  - `.txt` → `FileReader.readAsText()`
  - `.docx` → `mammoth.extractRawValue(arrayBuffer)`
  - `.pdf` → `pdfjsLib.getDocument()` → iterate pages → `page.getTextContent()`
- **CSS selector input** — text field with live validation; "Load" button sends selector to `content.js`
- **Picker button** — sends `{ type: "ACTIVATE_PICKER" }` to `content.js`
- **Selection button** — sends `{ type: "READ_SELECTION" }` to `content.js`

### reader/reader.js — RSVP Core

**Tokenizer:**
- Split on whitespace, strip leading/trailing punctuation per token
- Detect sentence endings (`.`, `!`, `?`) → apply 2× pause after that word
- Words >10 characters → 1.4× normal duration

**ORP Calculation:**
```js
function getOrpIndex(word) {
  return Math.max(0, Math.floor(word.length * 0.3) - 1);
}
```

**Rendering:**
Each word is split into three `<span>` elements:
- `.before` — letters before ORP (muted gray)
- `.orp` — ORP letter (orange/red, bold, fixed horizontal position)
- `.after` — letters after ORP (muted gray)

The ORP character is always at the same x-position — the eye is stationary.

**Timing Loop:**
```js
interval = 60000 / wpm   // ms per word
```
Uses `setTimeout` chain (not `setInterval`) for accurate per-word timing with variable pauses.

**Controls:**
- Play / Pause (also Spacebar)
- Restart
- WPM Slider (100–800, step 50, default 250) — adjustable during playback
- Progress counter: `Word 42 / 318`
- End of text: auto-pause, show "Done" banner with "Restart" button

---

## Cross-Browser Compatibility

- **Manifest V3** for both Chrome and Firefox (FF109+)
- `vendor/browser-polyfill.min.js` normalizes `chrome.*` vs `browser.*` — all code uses `chrome.*`
- No build step required; distribution package = ZIP of project folder

---

## Error Handling

| Situation | Behavior |
|---|---|
| Empty selection | Toast in popup: "Kein Text ausgewählt" |
| CSS selector matches nothing | Popup feedback: "Element nicht gefunden", selector highlighted red |
| PDF is scan-only | Error in reader: "PDF enthält keinen extrahierbaren Text" |
| `.doc` file uploaded | Error: "Bitte .docx verwenden (modernes Word-Format)" |
| File >10 MB | Warning before load: "Datei sehr groß – Laden kann dauern" |
| Text <5 words | Show all words at once without loop |
| Emoji / special chars | Treated as single token, no crash |
| Tab closed before text arrives | Graceful ignore, no error popup |

---

## Testing

- **Unit tests** for reader logic (tokenizer, ORP calc, timing): `tests/reader-logic.html` — loads `reader.js` and asserts via `console.assert()`
- **Manual smoke test checklist**: `docs/testing.md`
- No automated browser tests (YAGNI)

---

## Open Questions / Future

- Word-grouping mode (2–3 words at once) — possible future feature
- Progress persistence across sessions — possible via `chrome.storage.local`
- Web App port — same reader core, different entry point
