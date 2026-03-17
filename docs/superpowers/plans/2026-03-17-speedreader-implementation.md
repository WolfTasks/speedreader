# SpeedReader Browser Extension Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-browser (Chrome/Firefox) MV3 browser extension that presents text word-by-word with ORP letter highlighting for speed reading, supporting web page text and local file uploads.

**Architecture:** Vanilla JS, no build step. Pure logic lives in `reader/reader-core.js` (testable ES module). `background.js` is the service worker coordinating storage and tab opening. `content.js` handles in-page interaction. `popup/popup.js` handles file parsing and UI triggers.

**Tech Stack:** HTML/CSS/JS (ES Modules), Manifest V3, pdf.js 3.11.174 (PDF), mammoth.js 1.6.0 (DOCX), Mozilla WebExtension Polyfill 0.12.0

---

## File Map

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 declaration, permissions, script registration |
| `background.js` | Service worker: context menu, storage (session+local fallback), opens reader tab, delivers text to reader |
| `content.js` | In-page: element picker, CSS selector, selection-button handler |
| `popup/popup.html` | Extension popup UI shell + loads vendor libs |
| `popup/popup.js` | File upload + parsing, button wiring, sendMessage to content.js |
| `popup/popup.css` | Popup styles |
| `reader/reader-core.js` | Pure module: tokenizer, ORP index calc, splitAtOrp — no DOM, no chrome.* |
| `reader/reader.html` | Full-tab reader UI shell |
| `reader/reader.js` | Entry point: wires DOM, RSVP loop, sends READER_READY to background |
| `reader/reader.css` | Reader styles; ORP centering via flex layout |
| `vendor/browser-polyfill.min.js` | Chrome/Firefox API normalization |
| `vendor/pdf.min.js` | pdf.js browser build |
| `vendor/pdf.worker.min.js` | pdf.js worker (required by pdf.js) |
| `vendor/mammoth.browser.min.js` | mammoth.js browser build |
| `tests/reader-logic.html` | In-browser unit tests for reader-core.js |
| `docs/testing.md` | Manual smoke test checklist |

---

## Chunk 1: Project Scaffold + Vendor Files

### Task 1: Create directory structure and download vendor libraries

**Files:**
- Create: `manifest.json`
- Create: `vendor/` (directory + 4 files via curl)
- Create: `.gitignore`

- [ ] **Step 1: Create directories**

The git repository was already initialized when the design spec was written. Verify:
```bash
cd "C:/Users/Admin/IdeaProjects/speedreader"
git status
```
Expected output mentions branch `master` and the `docs/` directory. If the repo does not exist yet:
```bash
git init
git config user.email "admin@speedreader.local"
git config user.name "Admin"
```

Then create the source directories:
```bash
mkdir -p vendor popup reader tests
```

- [ ] **Step 2: Download vendor libraries**

```bash
cd "C:/Users/Admin/IdeaProjects/speedreader"

curl -L -o vendor/browser-polyfill.min.js \
  "https://unpkg.com/webextension-polyfill@0.12.0/dist/browser-polyfill.min.js"

curl -L -o vendor/pdf.min.js \
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"

curl -L -o vendor/pdf.worker.min.js \
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"

curl -L -o vendor/mammoth.browser.min.js \
  "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"
```

Expected: 4 files in `vendor/`, each >10 KB.

- [ ] **Step 3: Create `.gitignore`**

```
*.log
.DS_Store
Thumbs.db
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/.gitignore`

- [ ] **Step 4: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "SpeedReader",
  "version": "0.1.0",
  "description": "Lese Texte schneller mit der RSVP-Methode",
  "permissions": ["contextMenus", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["vendor/browser-polyfill.min.js", "content.js"]
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "SpeedReader"
  }
}
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/manifest.json`

- [ ] **Step 5: Verify extension loads in Chrome**

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" → select `C:/Users/Admin/IdeaProjects/speedreader`
4. Expected: SpeedReader appears in the list, no blocking errors (a "no icons" warning is normal and expected — ignored for now)

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/Admin/IdeaProjects/speedreader"
git add manifest.json vendor/ .gitignore
git commit -m "feat: project scaffold with manifest and vendor libs"
```

---

## Chunk 2: reader-core.js (TDD)

### Task 2: Write unit tests first, then implement pure reader logic

**Files:**
- Create: `tests/reader-logic.html`
- Create: `reader/reader-core.js`

- [ ] **Step 1: Write the failing tests (`tests/reader-logic.html`)**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>SpeedReader – Unit Tests</title>
  <style>
    body { font-family: monospace; padding: 1rem; background: #1a1a2e; color: #e0e0e0; }
    .pass { color: #4caf50; }
    .fail { color: #e94560; font-weight: bold; }
    summary { cursor: pointer; color: #888; margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>SpeedReader – Unit Tests</h1>
  <div id="output"></div>
  <script type="module">
    import { tokenize, getOrpIndex, splitAtOrp } from '../reader/reader-core.js';

    const results = [];
    function assert(description, condition) {
      results.push({ description, pass: Boolean(condition) });
      if (!condition) console.error('FAIL:', description);
    }

    // --- tokenize ---
    const t1 = tokenize('Hello, world! Foo');
    assert('tokenize: 3 tokens from "Hello, world! Foo"', t1.length === 3);
    assert('tokenize: strips comma → "Hello"', t1[0].word === 'Hello');
    assert('tokenize: "world!" → pauseMultiplier 2 (sentence end)', t1[1].pauseMultiplier === 2);
    assert('tokenize: "Foo" → pauseMultiplier 1', t1[2].pauseMultiplier === 1);

    const t2 = tokenize('Extraordinarily');
    assert('tokenize: 11-char word → pauseMultiplier 1.4', t2[0].pauseMultiplier === 1.4);

    const t3 = tokenize('End!');
    assert('tokenize: "End!" → pauseMultiplier 2 (sentence end overrides long-word check)', t3[0].pauseMultiplier === 2);

    const t4 = tokenize('   ');
    assert('tokenize: whitespace-only → empty array', t4.length === 0);

    const t5 = tokenize('');
    assert('tokenize: empty string → empty array', t5.length === 0);

    const t6 = tokenize('Hello\nworld');
    assert('tokenize: newline treated as whitespace separator → 2 tokens', t6.length === 2);

    // --- getOrpIndex ---
    assert('getOrpIndex: 1-char → 0', getOrpIndex('A') === 0);
    assert('getOrpIndex: 2-char → 0', getOrpIndex('Hi') === 0);
    assert('getOrpIndex: 3-char → 0  (floor(0.9)-1 = -1 → max 0)', getOrpIndex('the') === 0);
    assert('getOrpIndex: 5-char → 0  (floor(1.5)-1 = 0)', getOrpIndex('Hello') === 0);
    assert('getOrpIndex: 7-char → 1  (floor(2.1)-1 = 1)', getOrpIndex('Reading') === 1);
    assert('getOrpIndex: 10-char → 2  (floor(3.0)-1 = 2)', getOrpIndex('SpeedReads') === 2);

    // --- splitAtOrp ---
    const s1 = splitAtOrp('A');
    assert('splitAtOrp 1-char: before=""', s1.before === '');
    assert('splitAtOrp 1-char: orp="A"', s1.orp === 'A');
    assert('splitAtOrp 1-char: after=""', s1.after === '');

    const s2 = splitAtOrp('Hi');
    assert('splitAtOrp 2-char: before=""', s2.before === '');
    assert('splitAtOrp 2-char: orp="H"', s2.orp === 'H');
    assert('splitAtOrp 2-char: after="i"', s2.after === 'i');

    const s3 = splitAtOrp('Reading');
    assert('splitAtOrp "Reading": before="R"', s3.before === 'R');
    assert('splitAtOrp "Reading": orp="e"', s3.orp === 'e');
    assert('splitAtOrp "Reading": after="ading"', s3.after === 'ading');

    // Render
    const out = document.getElementById('output');
    let passed = 0, failed = 0;
    for (const r of results) {
      const div = document.createElement('div');
      div.className = r.pass ? 'pass' : 'fail';
      div.textContent = (r.pass ? '✓ ' : '✗ ') + r.description;
      out.appendChild(div);
      r.pass ? passed++ : failed++;
    }
    const summary = document.createElement('p');
    summary.style.marginTop = '1rem';
    summary.style.fontWeight = 'bold';
    summary.textContent = `${passed} passed, ${failed} failed`;
    summary.style.color = failed > 0 ? '#e94560' : '#4caf50';
    out.appendChild(summary);
  </script>
</body>
</html>
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/tests/reader-logic.html`

- [ ] **Step 2: Start a local HTTP server and open tests**

Chrome blocks ES Module `import` statements over `file://` (CORS policy). Use Python's built-in server:

```bash
cd "C:/Users/Admin/IdeaProjects/speedreader"
python -m http.server 8765
```

Then open in Chrome: `http://localhost:8765/tests/reader-logic.html`

Expected: Import error in browser console — `reader-core.js` does not exist yet. The page may show a blank screen or a JS error. This confirms the test harness is wired up correctly.

Leave the server running for Step 4.

- [ ] **Step 3: Implement `reader/reader-core.js`**

```js
// reader/reader-core.js
// Pure logic: no DOM, no chrome.* calls.

/**
 * Tokenize plain text into an array of { word, pauseMultiplier } objects.
 * pauseMultiplier is multiplied against the base WPM interval for this token.
 */
export function tokenize(text) {
  const raw = text.trim().split(/\s+/);
  const tokens = [];
  for (const rawWord of raw) {
    if (!rawWord) continue;
    // Strip leading/trailing non-word characters for display
    const word = rawWord.replace(/^[^\w\u00C0-\u024F]+|[^\w\u00C0-\u024F]+$/g, '') || rawWord;
    // Sentence endings take priority over long-word multiplier
    if (/[.!?]['"]?$/.test(rawWord)) {
      tokens.push({ word, pauseMultiplier: 2 });
    } else if (word.length > 10) {
      tokens.push({ word, pauseMultiplier: 1.4 });
    } else {
      tokens.push({ word, pauseMultiplier: 1 });
    }
  }
  return tokens;
}

/**
 * Return the 0-based index of the ORP (Optimal Recognition Point) letter.
 * Formula: floor(length * 0.3) - 1, minimum 0.
 */
export function getOrpIndex(word) {
  return Math.max(0, Math.floor(word.length * 0.3) - 1);
}

/**
 * Split a word into { before, orp, after } parts for rendering.
 * before = text left of ORP, orp = the highlighted letter, after = rest.
 */
export function splitAtOrp(word) {
  const idx = getOrpIndex(word);
  return {
    before: word.slice(0, idx),
    orp:    word[idx] ?? '',
    after:  word.slice(idx + 1),
  };
}
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/reader/reader-core.js`

- [ ] **Step 4: Reload tests and verify all pass**

Reload `http://localhost:8765/tests/reader-logic.html` in browser.
Expected: All checkmarks green, "X passed, 0 failed" at the bottom. No red entries.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Admin/IdeaProjects/speedreader"
git add reader/reader-core.js tests/reader-logic.html
git commit -m "feat: reader-core tokenizer and ORP logic with unit tests"
```

---

## Chunk 3: Reader UI

### Task 3: Build the full-tab RSVP reader

**Files:**
- Create: `reader/reader.html`
- Create: `reader/reader.css`
- Create: `reader/reader.js`

- [ ] **Step 1: Create `reader/reader.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SpeedReader</title>
  <link rel="stylesheet" href="reader.css">
</head>
<body>
  <div id="reader-container">

    <div id="word-display">
      <div id="word-wrapper">
        <span id="word-before" class="word-part before"></span>
        <span id="word-orp"    class="word-part orp"></span>
        <span id="word-after"  class="word-part after"></span>
      </div>
      <div id="focus-vline"></div>
    </div>

    <div id="controls">
      <button id="btn-restart"   title="Neu starten">⏮</button>
      <button id="btn-playpause" title="Play/Pause (Leertaste)">▶</button>
      <div id="wpm-control">
        <label for="wpm-slider">WPM</label>
        <input type="range" id="wpm-slider" min="100" max="800" step="50" value="250">
        <span id="wpm-display">250</span>
      </div>
      <div id="progress">
        Wort <span id="word-index">–</span> / <span id="word-total">–</span>
      </div>
    </div>

    <div id="done-banner" hidden>
      <p>Fertig!</p>
      <button id="btn-done-restart">Neu starten</button>
    </div>

    <div id="error-banner" hidden>
      <p>Kein Text empfangen — bitte erneut versuchen.</p>
    </div>

  </div>

  <script src="../vendor/browser-polyfill.min.js"></script>
  <script type="module" src="reader.js"></script>
</body>
</html>
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/reader/reader.html`

- [ ] **Step 2: Create `reader/reader.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #1a1a2e;
  color: #e0e0e0;
  font-family: 'Courier New', Courier, monospace;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

#reader-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  width: 100%;
  max-width: 640px;
  padding: 2rem;
}

/* ── Word display ── */
#word-display {
  position: relative;
  width: 540px;
  height: 100px;
  background: #16213e;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* Horizontal guide line */
#word-display::after {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 50%;
  height: 1px;
  background: rgba(255,255,255,0.04);
}

/* Vertical ORP marker line */
#focus-vline {
  position: absolute;
  top: 0; bottom: 0;
  /* ORP column starts at 250px from left; center of 20px ORP col = 260px */
  left: 260px;
  width: 1px;
  background: rgba(233,69,96,0.25);
  pointer-events: none;
}

/* ── Word wrapper: 3-column flex, ORP always at center ── */
#word-wrapper {
  display: flex;
  align-items: baseline;
  font-size: 2.4rem;
  line-height: 1;
  user-select: none;
}

.before {
  width: 250px;
  text-align: right;
  flex-shrink: 0;
  color: #9a9aaa;
}

.orp {
  width: 20px;
  text-align: center;
  flex-shrink: 0;
  color: #e94560;
  font-weight: bold;
}

.after {
  width: 250px;
  text-align: left;
  flex-shrink: 0;
  color: #9a9aaa;
}

/* ── Controls ── */
#controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

button {
  background: #16213e;
  color: #e0e0e0;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 1.1rem;
  transition: background 0.15s;
}
button:hover { background: #0f3460; }

#wpm-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}
#wpm-slider { width: 120px; cursor: pointer; accent-color: #e94560; }
#wpm-display { min-width: 3ch; text-align: right; }

#progress { color: #666; font-size: 0.85rem; }

/* ── Banners ── */
#done-banner, #error-banner {
  text-align: center;
  color: #888;
}
#done-banner p { font-size: 1.4rem; color: #e0e0e0; margin-bottom: 1rem; }
#error-banner p { color: #e94560; }
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/reader/reader.css`

- [ ] **Step 3: Create `reader/reader.js`**

```js
// reader/reader.js — RSVP entry point
import { tokenize, splitAtOrp } from './reader-core.js';

// DOM refs
const elBefore    = document.getElementById('word-before');
const elOrp       = document.getElementById('word-orp');
const elAfter     = document.getElementById('word-after');
const elIndex     = document.getElementById('word-index');
const elTotal     = document.getElementById('word-total');
const elPlayPause = document.getElementById('btn-playpause');
const elRestart   = document.getElementById('btn-restart');
const elWpmSlider = document.getElementById('wpm-slider');
const elWpmDisplay= document.getElementById('wpm-display');
const elDone      = document.getElementById('done-banner');
const elError     = document.getElementById('error-banner');
const elControls  = document.getElementById('controls');
const elDoneRestart = document.getElementById('btn-done-restart');

// State
let tokens = [];
let currentIndex = 0;
let wpm = 250;
let playing = false;
let timeoutId = null;

function renderWord(index) {
  const { word } = tokens[index];
  const { before, orp, after } = splitAtOrp(word);
  elBefore.textContent = before;
  elOrp.textContent    = orp;
  elAfter.textContent  = after;
  elIndex.textContent  = index + 1;
}

function scheduleNext() {
  if (!playing) return;
  const { pauseMultiplier } = tokens[currentIndex];
  const delay = (60000 / wpm) * pauseMultiplier;
  timeoutId = setTimeout(() => {
    currentIndex++;
    if (currentIndex >= tokens.length) {
      playing = false;
      elPlayPause.textContent = '▶';
      elDone.hidden = false;
      return;
    }
    renderWord(currentIndex);
    scheduleNext();
  }, delay);
}

function play() {
  if (currentIndex >= tokens.length) return;
  playing = true;
  elPlayPause.textContent = '⏸';
  elDone.hidden = true;
  renderWord(currentIndex);
  scheduleNext();
}

function pause() {
  playing = false;
  elPlayPause.textContent = '▶';
  clearTimeout(timeoutId);
}

function restart() {
  pause();
  currentIndex = 0;
  elDone.hidden = true;
  if (tokens.length > 0) renderWord(0);
}

function initReader(text) {
  tokens = tokenize(text);

  if (tokens.length === 0) {
    elError.hidden = false;
    elControls.style.visibility = 'hidden';
    return;
  }

  elTotal.textContent = tokens.length;

  // Short texts: show all words joined, no loop, disable keyboard shortcut
  if (tokens.length < 5) {
    elBefore.textContent = '';
    elOrp.textContent    = tokens.map(t => t.word).join(' ');
    elAfter.textContent  = '';
    elIndex.textContent  = tokens.length;
    elControls.style.visibility = 'hidden';
    document.removeEventListener('keydown', onKeydown);
    return;
  }

  renderWord(0);
}

// Controls
elPlayPause.addEventListener('click', () => playing ? pause() : play());
elRestart.addEventListener('click', restart);
elDoneRestart.addEventListener('click', () => { restart(); play(); });

function onKeydown(e) {
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
    playing ? pause() : play();
  }
}
document.addEventListener('keydown', onKeydown);

elWpmSlider.addEventListener('input', () => {
  wpm = parseInt(elWpmSlider.value, 10);
  elWpmDisplay.textContent = wpm;
  // Change takes effect on next word (current setTimeout fires at old interval)
});

// Bootstrap: request text from background service worker
chrome.runtime.sendMessage({ type: 'READER_READY' }, (response) => {
  if (chrome.runtime.lastError || !response?.text) {
    elError.hidden = false;
    elControls.style.visibility = 'hidden';
    return;
  }
  initReader(response.text);
});
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/reader/reader.js`

- [ ] **Step 4: Manual test — open reader.html directly**

1. In Chrome with the extension loaded, navigate to:
   `chrome-extension://<extension-id>/reader/reader.html`
   (find the ID on `chrome://extensions`)
2. Expected: Dark page, error banner "Kein Text empfangen" shown (no text in storage yet — correct)
3. Controls hidden — correct behavior for empty state

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Admin/IdeaProjects/speedreader"
git add reader/
git commit -m "feat: reader UI with RSVP display, ORP rendering, and controls"
```

---

## Chunk 4: background.js + content.js

### Task 4: Service worker — context menu, storage, message routing

**Files:**
- Create: `background.js`

- [ ] **Step 1: Create `background.js`**

```js
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
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/background.js`

- [ ] **Step 2: Reload extension and test context menu**

1. Go to `chrome://extensions` → reload SpeedReader
2. Open any webpage, select some text
3. Right-click → expected: "Mit SpeedReader lesen" entry in context menu
4. Click it → expected: new tab opens with `reader/reader.html`, text displayed word-by-word

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/Admin/IdeaProjects/speedreader"
git add background.js
git commit -m "feat: background service worker with context menu and storage relay"
```

### Task 5: Content script — element picker, CSS selector, selection button

**Files:**
- Create: `content.js`

- [ ] **Step 1: Create `content.js`**

```js
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
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/content.js`

- [ ] **Step 2: Reload extension and test element picker**

1. Reload extension on `chrome://extensions`
2. Open any article page (e.g. Wikipedia)
3. Click the SpeedReader extension icon → popup opens
4. _(Popup doesn't exist yet — we'll test this in Task 6. For now, test via DevTools console):_
   ```js
   chrome.tabs.sendMessage(<tabId>, { type: 'ACTIVATE_PICKER' })
   ```
   Expected: cursor changes to crosshair, elements highlighted on hover

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/Admin/IdeaProjects/speedreader"
git add content.js
git commit -m "feat: content script with element picker, CSS selector, and selection handler"
```

---

## Chunk 5: Popup UI

### Task 6: Build the extension popup

**Files:**
- Create: `popup/popup.html`
- Create: `popup/popup.css`
- Create: `popup/popup.js`

- [ ] **Step 1: Create `popup/popup.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>SpeedReader</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div id="app">
    <header>
      <h1>SpeedReader</h1>
    </header>

    <section class="section" id="web-section">
      <h2>Webseite</h2>
      <button class="btn-full" id="btn-selection">Markierten Text lesen</button>
      <button class="btn-full" id="btn-picker">Element auswählen (Picker)</button>
      <div class="input-row">
        <input
          type="text"
          id="selector-input"
          placeholder="CSS-Selektor, z.B. article"
          autocomplete="off"
          spellcheck="false"
        />
        <button id="btn-selector">Laden</button>
      </div>
      <div id="selector-feedback" class="feedback" hidden></div>
    </section>

    <section class="section" id="file-section">
      <h2>Datei <span class="hint">(.txt, .docx, .pdf)</span></h2>
      <label class="file-label" for="file-input">Datei auswählen…</label>
      <input type="file" id="file-input" accept=".txt,.docx,.pdf" hidden />
      <div id="file-feedback" class="feedback" hidden></div>
    </section>

    <div id="global-status" class="feedback" hidden></div>
  </div>

  <script src="../vendor/browser-polyfill.min.js"></script>
  <script src="../vendor/mammoth.browser.min.js"></script>
  <script src="../vendor/pdf.min.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/popup/popup.html`

- [ ] **Step 2: Create `popup/popup.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  width: 300px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  background: #1a1a2e;
  color: #e0e0e0;
}

#app { padding: 12px; display: flex; flex-direction: column; gap: 12px; }

header h1 {
  font-size: 16px;
  color: #e94560;
  letter-spacing: 1px;
  text-align: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #2a2a4a;
}

.section h2 {
  font-size: 12px;
  text-transform: uppercase;
  color: #666;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.hint { font-size: 11px; text-transform: none; color: #555; }

.btn-full {
  width: 100%;
  background: #16213e;
  color: #e0e0e0;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  margin-bottom: 6px;
  transition: background 0.15s;
}
.btn-full:hover { background: #0f3460; }

.input-row {
  display: flex;
  gap: 6px;
}

input[type="text"] {
  flex: 1;
  background: #16213e;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  padding: 6px 8px;
  color: #e0e0e0;
  font-size: 13px;
  outline: none;
}
input[type="text"]:focus { border-color: #4a90e2; }
input[type="text"].error { border-color: #e94560; }

#btn-selector {
  background: #16213e;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  padding: 6px 10px;
  cursor: pointer;
  white-space: nowrap;
}
#btn-selector:hover { background: #0f3460; }

.file-label {
  display: block;
  background: #16213e;
  border: 1px dashed #2a2a4a;
  border-radius: 4px;
  padding: 10px;
  text-align: center;
  cursor: pointer;
  color: #888;
  transition: background 0.15s, border-color 0.15s;
}
.file-label:hover { background: #0f3460; border-color: #4a90e2; color: #e0e0e0; }

.feedback {
  font-size: 12px;
  padding: 4px 0;
  margin-top: 4px;
}
.feedback.error { color: #e94560; }
.feedback.success { color: #4caf50; }
.feedback.warning { color: #ff9800; }
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/popup/popup.css`

- [ ] **Step 3: Create `popup/popup.js`**

```js
// popup/popup.js

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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

// Configure pdf.js worker path (must be an extension-internal URL)
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    chrome.runtime.getURL('vendor/pdf.worker.min.js');
}

// ── Helpers ──

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContent(message) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('no-tab');
  return chrome.tabs.sendMessage(tab.id, message);
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
  } catch {
    showFeedback(globalStatus, 'Seite nicht zugänglich.', 'error');
  }
});

btnPicker.addEventListener('click', async () => {
  clearFeedback(globalStatus);
  try {
    await sendToContent({ type: 'ACTIVATE_PICKER' });
    window.close();
  } catch {
    showFeedback(globalStatus, 'Seite nicht zugänglich.', 'error');
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
  } catch {
    showFeedback(globalStatus, 'Seite nicht zugänglich.', 'error');
  }
}

// ── File section ──

fileLabel.addEventListener('click', () => fileInput.click());

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
    const confirmed = window.confirm(
      `Die Datei ist sehr groß (${(file.size / 1024 / 1024).toFixed(1)} MB).\nDas Laden kann dauern. Fortfahren?`
    );
    if (!confirmed) {
      fileInput.value = '';
      return;
    }
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
    const result = await mammoth.extractRawValue({ arrayBuffer: buf });
    return result.value;
  }
  if (ext === 'pdf') {
    const buf = await readAsArrayBuffer(file);
    return extractPdfText(buf);
  }
  throw new Error('Unbekanntes Format');
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
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/popup/popup.js`

- [ ] **Step 4: Reload extension and test full flow**

1. Reload extension on `chrome://extensions`
2. Open any webpage, click the SpeedReader icon → popup should open
3. Test "Markierten Text lesen": select text on page first, then click button → reader tab opens
4. Test "Element auswählen": click button, cursor changes to crosshair → click an element → reader opens
5. Test CSS selector: type `p` → click "Laden" → reader opens with first paragraph
6. Test file upload: drag a `.txt` file → reader opens

- [ ] **Step 5: Test in Firefox**

1. Open Firefox → `about:debugging` → "This Firefox" → "Load Temporary Add-on"
2. Select `manifest.json` from the project folder
3. Repeat smoke tests above

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/Admin/IdeaProjects/speedreader"
git add popup/
git commit -m "feat: popup UI with file upload, web text extraction, and selector input"
```

---

## Chunk 6: Smoke Test Checklist + Final Polish

### Task 7: Write manual smoke test checklist and finalize

**Files:**
- Create: `docs/testing.md`

- [ ] **Step 1: Create `docs/testing.md`**

```markdown
# SpeedReader — Manual Smoke Test Checklist

Run these tests after any significant change. Test in both Chrome and Firefox.

## Setup
- [ ] Load extension unpacked (Chrome: chrome://extensions, Firefox: about:debugging)
- [ ] No errors shown in extension list

## Context Menu (background.js)
- [ ] Select text on a webpage
- [ ] Right-click → "Mit SpeedReader lesen" appears
- [ ] Click entry → reader tab opens with text displayed
- [ ] Text scrolls word-by-word at default 250 WPM
- [ ] ORP letter is highlighted in red/orange at consistent horizontal position

## Reader Controls
- [ ] Spacebar: play/pause toggles
- [ ] ⏮ button: restarts from first word
- [ ] WPM slider: change during playback → next word uses new speed
- [ ] Progress counter updates (Wort X / Y)
- [ ] After last word: "Fertig!" banner + "Neu starten" button shown
- [ ] "Neu starten": restarts and plays automatically

## Popup — Marked Text
- [ ] Select text on page, open popup, click "Markierten Text lesen" → reader opens
- [ ] Click button with nothing selected → "Kein Text ausgewählt." shown

## Popup — Element Picker
- [ ] Click "Element auswählen" → cursor becomes crosshair
- [ ] Hover over elements → blue outline appears
- [ ] Click element → reader opens with element's text
- [ ] Press Escape → picker cancelled, cursor restored

## Popup — CSS Selector
- [ ] Type `article` → click "Laden" → reader opens (on page with <article>)
- [ ] Type `.nonexistent` → "Element nicht gefunden." shown, input turns red
- [ ] Type `head` → "Element enthält keinen Text." shown
- [ ] Press Enter in selector field → same as clicking "Laden"

## Popup — File Upload (.txt)
- [ ] Upload a .txt file → reader opens with content
- [ ] Large .txt (>10 MB) → warning shown, still loads

## Popup — File Upload (.docx)
- [ ] Upload a .docx file → reader opens with extracted text
- [ ] Upload a .doc file → error "Bitte .docx verwenden" shown

## Popup — File Upload (.pdf)
- [ ] Upload a text-based PDF → reader opens with extracted text
- [ ] Upload a scan-only PDF (image PDF) → error about no extractable text shown

## Reader — Edge Cases
- [ ] Open reader tab directly (no text) → error banner shown
- [ ] Text with fewer than 5 words → all words shown joined, no loop
- [ ] Text with emojis → displayed without crash

## Cross-Browser
- [ ] All above tests pass in Chrome
- [ ] All above tests pass in Firefox (115+)
```

Save to: `C:/Users/Admin/IdeaProjects/speedreader/docs/testing.md`

- [ ] **Step 2: Run through the smoke test checklist in Chrome**

Work through `docs/testing.md` top to bottom. Fix any failures before proceeding.

- [ ] **Step 3: Run through the smoke test checklist in Firefox**

Repeat in Firefox. Note any differences.

- [ ] **Step 4: Final commit**

```bash
cd "C:/Users/Admin/IdeaProjects/speedreader"
git add docs/testing.md
git commit -m "docs: add manual smoke test checklist"
```

- [ ] **Step 5: Tag v0.1.0**

```bash
cd "C:/Users/Admin/IdeaProjects/speedreader"
git tag v0.1.0
```

---

## Distribution

To install the extension permanently (no developer mode needed in Firefox; Chrome requires developer mode for unpacked):

**Chrome:**
1. Zip the project folder (excluding `.git/`)
2. Rename to `speedreader-v0.1.0.zip`
3. Load via `chrome://extensions` → "Load unpacked" (or submit to Chrome Web Store)

**Firefox:**
1. Zip the project folder
2. Load via `about:debugging` → "Load Temporary Add-on" (persists until Firefox restart)
3. Or sign and submit via [addons.mozilla.org](https://addons.mozilla.org)
