# SpeedReader — Store-Listing (Chrome Web Store & Firefox AMO)

Stand: v0.2.0 (`manifest.json`: `activeTab`, `contextMenus`, `scripting`, `storage`; keine Host-Berechtigungen, keine `content_scripts`).

Privacy-Policy-URL (GitHub Pages aus `main` → `/docs`): **https://wolftasks.github.io/speedreader/privacy-policy.html**

---

## Kategorie

- **Chrome Web Store:** Productivity → *Tools* (Alternative: *Education*)
- **AMO:** *Productivity* (zweite Kategorie optional: *Other*)

---

## Kurzbezeichnung (≤132 Zeichen — im Dashboard als "Short description" eintragen)

SpeedReader zeigt Texte Wort für Wort mit der RSVP-Methode — schneller lesen mit optimalem Fokuspunkt.

*(102 Zeichen)* — entspricht nicht exakt der `description` im Manifest ("Lese Texte schneller mit der RSVP-Methode"); das ist zulässig, AMO übernimmt beim Upload aber zunächst die Manifest-Beschreibung als Summary.

---

## Ausführliche Beschreibung

**SpeedReader – Schneller lesen mit der RSVP-Methode**

RSVP (Rapid Serial Visual Presentation) ist eine bewährte Lese­technik: Jedes Wort erscheint einzeln an einer festen Position im Blick­feld. Dein Auge muss nicht mehr über die Zeile wandern — du kannst dich voll auf den Inhalt konzentrieren und liest dadurch deutlich schneller.

**Funktionen:**

- Markierten Text auf jeder Webseite sofort lesen (Rechtsklick → Kontextmenü, Popup oder Tastenkürzel Alt+Shift+R)
- Texte aus `.txt`-, `.docx`- und `.pdf`-Dateien direkt im Browser öffnen
- Einzelne Seiten­elemente per Klick oder CSS-Selektor auswählen
- Lese­geschwindigkeit von 100 bis 800 Wörtern pro Minute einstellen (in 50er-Schritten)
- Optimaler Erkennungs­punkt (ORP): Der wichtigste Buchstabe jedes Worts wird rot hervorgehoben, damit dein Gehirn das Wort schneller erfasst
- Tastatur­steuerung: Leertaste für Play/Pause
- Kein dauerhafter Zugriff auf Webseiten: SpeedReader wird nur auf dem Tab aktiv, auf dem du es ausdrücklich aufrufst

**Datenschutz:**
SpeedReader speichert Text ausschließlich lokal in deinem Browser und überträgt nichts an externe Server. Dateien werden lokal ausgelesen, es wird kein Code aus dem Internet nachgeladen.

---

## Single Purpose (Chrome: Tab "Privacy practices" → "Single purpose description")

> SpeedReader has a single purpose: reading text faster. It displays text the user explicitly chooses (selected text, a picked page element, or a local .txt/.docx/.pdf file) one word at a time (RSVP) with the optimal recognition point highlighted, in its own reader tab.

---

## Begründung der Berechtigungen
*(Chrome: Tab "Privacy practices" → je Berechtigung ein "Justification"-Feld. Es gibt **keine** Host-Berechtigungen und kein `<all_urls>`.)*

- **activeTab**: Only when the user explicitly invokes SpeedReader (toolbar popup, context menu, or the keyboard shortcut) does the extension get temporary access to the current tab, to read the text the user selected or picked. No access to any other tab or site.
- **scripting**: Used together with activeTab to inject the element picker / CSS selector / selection reader into the current tab on demand, at the moment the user clicks a popup button or presses the shortcut. No script runs on pages the user has not invoked the extension on.
- **contextMenus**: Adds the "Mit SpeedReader lesen" entry for selected text.
- **storage**: Temporarily stores the text to be read (session storage, local fallback) until the reader tab has loaded it; discarded after at most 5 minutes.

Weitere Angaben im Tab "Privacy practices":

- **Remote code:** "No, I am not using remote code." (alle Bibliotheken liegen in `vendor/`, pdf.js mit `isEvalSupported: false`)
- **Data usage:** keine der Datenkategorien ankreuzen; alle drei Zusicherungen (kein Verkauf, keine zweckfremde Nutzung, keine Bonitätsprüfung) bestätigen
- **Privacy policy URL:** siehe oben

---

## Grafiken

Vorhanden im Repo: `icons/icon-16.png`, `icon-48.png`, `icon-128.png` (128×128, RGBA), Quelle `icons/icon.svg`.

| Asset | Maße | Chrome | AMO | Status |
|---|---|---|---|---|
| Store-Icon | 128×128 PNG (Chrome-Empfehlung: 96×96 Motiv + 16 px transparenter Rand) | Pflicht | aus Manifest | `icons/icon-128.png` vorhanden — Rand gegen Empfehlung prüfen |
| Screenshots | exakt **1280×800** oder **640×400** px, 1–5 Stück | Pflicht (≥1) | empfohlen (beliebige Maße, 1280×800 passt) | **fehlt** |
| Small promo tile | **440×280** PNG/JPEG | im Dashboard meist als Pflichtfeld markiert | — | **fehlt** |
| Marquee promo tile | 1400×560 | optional | — | optional |

### Screenshot-Liste (Vorschlag, 1280×800)

1. Reader in Aktion: ein langes Wort mit rotem ORP-Buchstaben, WPM-Regler sichtbar
2. Popup mit allen vier Quellen (Markierter Text, Picker, CSS-Selektor, Datei)
3. Kontextmenü "Mit SpeedReader lesen" auf markiertem Text einer Webseite
4. Element-Picker mit hervorgehobenem Absatz
5. Reader mit geöffneter PDF-/DOCX-Datei

---

## Firefox Add-ons (AMO) — Hinweise

### Quellcode-Upload

AMO verlangt Quellcode nur, wenn Code minifiziert, gebündelt oder generiert ist. SpeedReader hat **keinen Build-Schritt**: der eigene Code (`background.js`, `content.js`, `popup/`, `reader/`) liegt unverändert und lesbar im ZIP. Minifiziert sind ausschließlich **unveränderte** Drittanbieter-Bibliotheken in `vendor/`; diese sind in `vendor/VENDOR.json` mit npm-Paket, Version, Quelle und sha256 inventarisiert.

→ Bei der Frage "Do you use code generators, minifiers, …?" **No** wählen (bzw. falls AMO wegen der `.min`-Dateien nachfragt: auf die Reviewer-Notes verweisen). Ein Source-ZIP ist nicht nötig; falls doch angefordert, genügt der Git-Tag `v0.2.0` als ZIP von GitHub.

### Notes to Reviewer (in das Feld "Notes to Reviewer" kopieren)

> No build step: all first-party code (background.js, content.js, popup/, reader/) is shipped as-is and unminified. Source: https://github.com/WolfTasks/speedreader (tag v0.2.0).
>
> The only minified files are unmodified third-party libraries, byte-identical to the published npm builds (sha256 over LF-normalized content, also listed in vendor/VENDOR.json):
>
> - vendor/pdf.min.mjs — pdfjs-dist 6.4.299, build/pdf.min.mjs, sha256 57456c8e0c81e46be31174b499ef77f2b9f5ee46d04412ba627320a36755d4c2
> - vendor/pdf.worker.min.mjs — pdfjs-dist 6.4.299, build/pdf.worker.min.mjs, sha256 9536359f1b8367850d485731ca1d5e45c159a7b7a0912325e539937aa21ceb18
> - vendor/mammoth.browser.min.js — mammoth 1.13.0, mammoth.browser.min.js, sha256 92914a3708cfdf1e62cb553d1856a7fedab21da83d8ee82845de2f897b368cab
> - vendor/browser-polyfill.min.js — webextension-polyfill 0.12.0, dist/browser-polyfill.min.js, sha256 918ed891c0e7f9b58b39ac32c9c3133eb2a1fbaaa27f4aa7579ae55e7572cc21
>
> pdf.js is called with isEvalSupported: false. No remote code, no network requests, no data collection. Permissions: activeTab + scripting (content.js is injected only after an explicit user gesture: popup button, context menu, Alt+Shift+R), contextMenus, storage (pending text, expires after 5 minutes).
>
> How to test: select text on any web page → right-click → "Mit SpeedReader lesen" (or open the toolbar popup → "Markierten Text lesen"). A reader tab opens; Space toggles play/pause.

### Data-Collection-Angabe (offen)

Neue AMO-Einreichungen verlangen seit Ende 2025 die Angabe `browser_specific_settings.gecko.data_collection_permissions` im Manifest (für SpeedReader: `{"required": ["none"]}`). v0.2.0 enthält diese Angabe **noch nicht** → vor der AMO-Einreichung Manifest ergänzen und als Patch-Release (z. B. v0.2.1) taggen; Chrome ignoriert den Schlüssel.

---

## Einreichungs-Checkliste — Chrome Web Store

- [ ] GitHub Pages aktivieren (Branch `main`, Ordner `/docs`) und https://wolftasks.github.io/speedreader/privacy-policy.html aufrufen
- [ ] Developer-Account anlegen: https://chrome.google.com/webstore/devconsole ($5 Einmalgebühr, 2-Faktor-Auth nötig)
- [ ] ZIP aus dem GitHub Release v0.2.0 herunterladen (`speedreader-0.2.0.zip`)
- [ ] Neues Element anlegen → ZIP hochladen
- [ ] Store listing: Kurz- und Langbeschreibung, Kategorie, Sprache Deutsch
- [ ] Store-Icon, Screenshots (≥1), Small promo tile hochladen
- [ ] Privacy practices: Single purpose, Berechtigungs-Begründungen, Remote code "No", Data usage, Privacy Policy URL: `https://wolftasks.github.io/speedreader/privacy-policy.html`
- [ ] Distribution: Public, alle Regionen
- [ ] Zur Review einreichen

## Einreichungs-Checkliste — Firefox AMO

- [ ] `data_collection_permissions` im Manifest ergänzen + Patch-Release (siehe oben)
- [ ] Account auf https://addons.mozilla.org/developers/ anlegen
- [ ] "Submit a New Add-on" → "On this site" (gelistet) → Release-ZIP hochladen, Validator-Warnungen prüfen
- [ ] Quellcode-Frage: No (siehe oben); Notes to Reviewer einfügen
- [ ] Name, Summary, Beschreibung, Kategorie, Lizenz, Privacy-Policy (URL oder Text), Support-URL `https://github.com/WolfTasks/speedreader/issues`
- [ ] Screenshots hochladen
- [ ] Einreichen
