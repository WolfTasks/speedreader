# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A browser extension (Chrome/Firefox, Manifest V3) that reads text using RSVP — displaying one word at a time with ORP highlighting. No build step, no npm, pure vanilla JS with ES modules. Do not introduce a build pipeline or package manager.

## Running Tests

```bash
node --test "tests/**/*.test.mjs"
```

Uses Node's built-in test runner (`node:test`) — still no npm/package.json. Covers `reader-core.js`, `reader.js` (RSVP loop/controls, fake timers), `background.js`, `content.js`, `popup.js` and `popup/zip-guard.js` (classic scripts run in a `vm` sandbox with fake `chrome`/DOM helpers from `tests/helpers/`), plus manifest/file-reference sanity checks. CI (`.github/workflows/ci.yml`) runs them on every push/PR, builds the extension ZIP, and on a `v*` tag matching `manifest.json`'s version publishes a GitHub release.

Nightly security scan (`.github/workflows/nightly-security.yml`): `vendor/VENDOR.json` inventories every vendored file (npm package, version, LF-normalized sha256); `.github/scripts/check-vendor-cves.mjs` verifies the inventory and queries OSV, plus Trivy secret/misconfig. **When updating anything in `vendor/`, update `VENDOR.json` in the same PR** (the scan fails on a stale inventory). Scanner tests: `node --test ".github/scripts/*.test.mjs"`.

`tests/reader-logic.html` is the older in-browser variant for `reader-core.js` (open via `file://`).

Manual testing checklist: `docs/testing.md`

## Architecture

### Data Flow

```
User (4 sources: selection [context menu / popup / Alt+Shift+R], element picker, CSS selector, file upload)
    ↓ popup: chrome.scripting.executeScript(content.js) into the active tab (activeTab), then tabs.sendMessage
    ↓ chrome.runtime.sendMessage({ type: "READ_TEXT", text })
background.js → chrome.storage.session.set (fallback: local) → chrome.tabs.create(reader.html)
    ↓ reader.js sends READER_READY message
background.js responds with stored text → reader.js tokenizes → RSVP loop starts
```

### Key Design Decisions

- **`reader-core.js` is a pure module** — no side effects, DOM, or chrome API calls. This is intentional for testability. Keep new logic here if it can be pure.
- **`setTimeout` chain, not `setInterval`** — prevents timer backlog in the RSVP loop.
- **Storage fallback** — session storage with fallback to local storage (session storage is quota-limited); pending text expires after 5 minutes (`PENDING_TTL_MS`) and stale local copies are purged on startup/install.
- **Minimum browsers: Chrome 121 / Firefox 121** — `background` declares both `service_worker` (Chrome) and `scripts` (Firefox event page); older versions reject that combination.
- **pdf.js is an ES module** (`vendor/pdf.min.mjs`) loaded via `popup/pdf-loader.mjs`, which exposes `pdfjsLib` for the classic `popup.js`; always call `getDocument` with `isEvalSupported: false`.
- **Upload limits** — 20 MB per file; `.docx` additionally max 50 MB unpacked (`popup/zip-guard.js` reads the ZIP central directory; ZIP64/corrupt archives rejected).
- **Message handlers only accept `sender.id === chrome.runtime.id`; picker handlers ignore untrusted (`!e.isTrusted`) events.**
- **ORP calculation**: `floor(word.length × 0.3) - 1` (0-based index). Words ≥ 10 chars get 1.4× pause; sentence-ending punctuation (.!?) gets 2× pause.
- **No host permissions, no manifest `content_scripts`** (security audit M2): permissions are `activeTab` + `scripting` (+ `contextMenus`, `storage`). `content.js` is injected on demand by `popup.js` (`chrome.scripting.executeScript({ files: ['content.js'] })`) right before each picker/selector/selection message; the user opening the popup grants `activeTab`. `content.js` is wrapped in an IIFE guarded by `globalThis.__speedreaderContentLoaded` so repeated injection never registers listeners twice. The context menu needs no injection (`info.selectionText`); the `read-selection` keyboard command (Alt+Shift+R) injects a one-off `func`. Injection failures (chrome://, about:, Web Store / addons.mozilla.org, built-in PDF viewer) surface as "Auf dieser Seite nicht verfügbar" in the popup and are ignored for the command. Firefox MV3 treats host permissions as opt-in anyway; `activeTab` is granted there by the same user gestures. Don't reintroduce `<all_urls>`.
