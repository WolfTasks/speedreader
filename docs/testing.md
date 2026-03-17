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
