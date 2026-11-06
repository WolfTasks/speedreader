# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A browser extension (Chrome/Firefox, Manifest V3) that reads text using RSVP — displaying one word at a time with ORP highlighting. No build step, no npm, pure vanilla JS with ES modules. Do not introduce a build pipeline or package manager.

## Running Tests

```bash
node --test "tests/**/*.test.mjs"
```

Uses Node's built-in test runner (`node:test`) — still no npm/package.json. Covers `reader-core.js`, `background.js` and `content.js` (classic scripts run in a `vm` sandbox with a fake `chrome`/DOM from `tests/helpers/`), plus manifest/file-reference sanity checks. CI (`.github/workflows/ci.yml`) runs them on every push/PR, builds the extension ZIP, and on a `v*` tag matching `manifest.json`'s version publishes a GitHub release.

`tests/reader-logic.html` is the older in-browser variant for `reader-core.js` (open via `file://`).

Manual testing checklist: `docs/testing.md`

## Architecture

### Data Flow

```
User (4 sources: selection, element picker, CSS selector, file upload)
    ↓ chrome.runtime.sendMessage({ type: "READ_TEXT", text })
background.js → chrome.storage.session.set (fallback: local) → chrome.tabs.create(reader.html)
    ↓ reader.js sends READER_READY message
background.js responds with stored text → reader.js tokenizes → RSVP loop starts
```

### Key Design Decisions

- **`reader-core.js` is a pure module** — no side effects, DOM, or chrome API calls. This is intentional for testability. Keep new logic here if it can be pure.
- **`setTimeout` chain, not `setInterval`** — prevents timer backlog in the RSVP loop.
- **Storage fallback** — session storage (Chrome 102+, Firefox 115+) with automatic fallback to local storage.
- **ORP calculation**: `floor(word.length × 0.3) - 1` (0-based index). Words ≥ 10 chars get 1.4× pause; sentence-ending punctuation (.!?) gets 2× pause.
- **`<all_urls>` host permission** is required because the context menu reads selected text from arbitrary pages via the content script.
