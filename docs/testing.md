# SpeedReader — Manual Smoke Test Checklist

Run these tests after any significant change. Test in both Chrome and Firefox.

## Setup
- [ ] Load extension unpacked (Chrome: chrome://extensions, Firefox: about:debugging)
- [ ] No errors shown in extension list

## Permissions / On-Demand Injection (activeTab)
- [ ] Extension details show **no** "read and change all your data on all websites" / "Zugriff auf alle Websites" warning (only activeTab-style access)
- [ ] Open a page and use popup → picker / selector / selection works **without** reloading the page after installing the extension
- [ ] Use picker, then selector, then selection on the same page (popup reopened each time) → each action triggers exactly one reader tab (no double injection)
- [ ] Restricted pages → popup button shows "Auf dieser Seite nicht verfügbar (geschützte Browser-Seite).": Chrome `chrome://extensions`, Chrome Web Store; Firefox `about:addons`, addons.mozilla.org, built-in PDF viewer
- [ ] Chrome PDF viewer tab: popup actions fail gracefully (restricted message or "Kein Text ausgewählt."), no uncaught error
- [ ] Firefox: no host permission prompt / "Zugriff auf Website-Daten" needed for picker & selector (activeTab granted by opening the popup)

## Keyboard Shortcut (background.js)
- [ ] Select text, press Alt+Shift+R → reader tab opens with the selection (check/assign in chrome://extensions/shortcuts or about:addons → Manage Extension Shortcuts)
- [ ] Alt+Shift+R without selection → nothing happens
- [ ] Alt+Shift+R on a restricted page → nothing happens, background console shows a single warning

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
- [ ] File > 20 MB (any type) → error "Datei zu groß (… MB). Maximal 20.0 MB erlaubt.", reader does not open

## Popup — File Upload (.docx)
- [ ] Upload a .docx file → reader opens with extracted text
- [ ] Upload a .doc file → error "Bitte .docx verwenden" shown
- [ ] .docx that unpacks to > 50 MB (zip bomb) or a corrupt .docx → readable error, popup stays responsive

## Popup — File Upload (.pdf)
- [ ] Upload a text-based PDF → reader opens with extracted text
- [ ] Upload a scan-only PDF (image PDF) → error about no extractable text shown
- [ ] Popup DevTools console: no errors loading `pdf-loader.mjs` / module worker `pdf.worker.min.mjs`

## Reader — Edge Cases
- [ ] Open reader tab directly (no text) → error banner shown
- [ ] Text with fewer than 5 words → all words shown joined, no loop
- [ ] Text with emojis → displayed without crash

## Cross-Browser
- [ ] All above tests pass in Chrome (121+), no manifest warnings on chrome://extensions
- [ ] All above tests pass in Firefox (121+), background event page starts (about:debugging → Inspect)
