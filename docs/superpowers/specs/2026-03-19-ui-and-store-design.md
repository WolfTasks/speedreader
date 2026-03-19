# SpeedReader — UI-Anpassung & Chrome Web Store Veröffentlichung

**Datum:** 2026-03-19
**Status:** Approved

---

## Scope

Zwei unabhängige, parallel umsetzbare Änderungen:

1. **UI:** Wortanzeige-Box im Reader verbreitern, Schriftgröße reduzieren
2. **Store:** Chrome Web Store Veröffentlichungsbereitschaft — Icons, Privacy Policy, Store-Texte, Gitea Build-Workflow

---

## 1. UI — Wortanzeige

### Problem

Die aktuelle Wortanzeige-Box ist 540px breit bei einer Schriftgröße von 2.4rem. Lange Wörter werden abgeschnitten, und die Schrift wirkt für längere Lesesessions zu groß.

### Lösung

Rein CSS-seitige Änderungen in `reader/reader.css`. Keine JavaScript-Änderungen nötig, keine Änderungen an `reader-core.js`.

| CSS-Selektor | Eigenschaft | Alt | Neu |
|---|---|---|---|
| `#reader-container` | `max-width` | `640px` | `800px` |
| `#word-display` | `width` | `540px` | `740px` |
| `#word-wrapper` | `font-size` | `2.4rem` | `1.8rem` |
| `.before` | `width` | `250px` | `360px` |
| `.after` | `width` | `250px` | `360px` |
| `#focus-vline` | `left` | `260px` | `370px` |

**ORP-Lineal-Berechnung:** `.before` (360px) + halbe `.orp`-Spalte (10px) = 370px. Die `.orp`-Spaltenbreite (20px) bleibt unverändert. Die Spaltensumme 360 + 20 + 360 = 740px entspricht exakt der Container-Breite — kein horizontaler Versatz durch `justify-content: center`.

### Was sich nicht ändert

- `reader-core.js` — ORP-Logik bleibt identisch
- `reader.html` — keine Struktur-Änderungen
- Alle anderen CSS-Regeln bleiben unverändert

---

## 2. Chrome Web Store — Veröffentlichungsbereitschaft

### 2.1 Icons

**Neue Dateien:**
- `icons/icon.svg` — Vektorquelle (SR-Monogramm, Hintergrund `#1a1a2e`, Akzent `#e94560`)
- `icons/icon-16.png`
- `icons/icon-48.png`
- `icons/icon-128.png`

**Änderungen an `manifest.json`:**
```json
"icons": {
  "16":  "icons/icon-16.png",
  "48":  "icons/icon-48.png",
  "128": "icons/icon-128.png"
},
"action": {
  "default_popup": "popup/popup.html",
  "default_title": "SpeedReader",
  "default_icon": {
    "16":  "icons/icon-16.png",
    "48":  "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

### 2.2 Privacy Policy

**Neue Datei:** `docs/privacy-policy.html`

Inhalt: Die Extension sammelt keine persönlichen Daten. Texte werden ausschließlich lokal in `chrome.storage.session` bzw. `chrome.storage.local` gespeichert und sofort nach dem Lesen gelöscht. Kein Cloud-Upload, keine Analyse, keine Weitergabe an Dritte.

Wird via GitHub Pages veröffentlicht unter:
`https://<username>.github.io/speedreader/docs/privacy-policy.html`

> **Hinweis:** Der Quellcode liegt auf Gitea. GitHub Pages dient ausschließlich als kostenloser statischer Hosting-Dienst für die Privacy Policy URL — der Chrome Web Store verlangt eine öffentlich erreichbare HTTPS-URL, GitHub Pages stellt diese bereit ohne eigene Infrastruktur.

> **Manueller Schritt:** GitHub Pages in den Repository-Einstellungen aktivieren (Branch `main`, Ordner `/docs` oder `/`).

### 2.3 Store-Texte

**Neue Datei:** `docs/store-listing.md`

Enthält:
- **Kurzbezeichnung** (≤132 Zeichen, DE) — wird im Dashboard als eigenes Feld "Short description" eingetragen, zusätzlich zur langen Beschreibung
- **Ausführliche Beschreibung** (DE) mit Erklärung der RSVP-Methode, Funktionsumfang
- **Kategorie:** Productivity
- **Begründung für `<all_urls>`** — wird im Chrome Web Store Submission-Formular als "Single-purpose justification" in ein eigenes Textfeld eingefügt: *"The extension injects a content script to capture selected text and activated element text from any webpage the user is viewing. Access to all URLs is required because the user can invoke the reader on any website."*
- **Screenshot-Hinweis:** Mindestens 1 Screenshot erforderlich, genau 1280×800 oder 640×400 Pixel (keine anderen Maße). Empfohlene Inhalte: Reader in Aktion (Wort wird angezeigt), Popup mit Optionen. Bis zu 5 Screenshots möglich.
- **Promotional Tile (optional):** 440×280 PNG — wird für Featured-Platzierungen benötigt, sonst optional.

### 2.4 Gitea Build-Workflow

**Neue Datei:** `.gitea/workflows/build.yml`

Trigger: Push auf `main`

Schritte:
1. Repository auschecken
2. ZIP erstellen — enthält alle Extension-Dateien **außer**: `.git/`, `.gitea/`, `.idea/`, `docs/`, `tests/`, `*.md`
3. ZIP als Gitea Actions Artifact hochladen (manuell downloadbar aus dem Workflow-Run)

ZIP-Name: `speedreader-<version>.zip` (Version aus `manifest.json` ausgelesen via `node -e "console.log(require('./manifest.json').version)"` — Node.js wird auf dem Runner vorausgesetzt)

---

## Manuelle Schritte (nicht automatisierbar)

| Schritt | Wer | Wann |
|---|---|---|
| Screenshots erstellen (exakt 1280×800 oder 640×400 px, min. 1, max. 5) | Nutzer | Vor Store-Einreichung |
| GitHub Pages aktivieren | Nutzer | Vor Store-Einreichung |
| Chrome Web Store Developer Account anlegen ($5) | Nutzer | Einmalig |
| ZIP aus Gitea herunterladen und im Store einreichen | Nutzer | Bei jedem Release |

---

## Nicht im Scope

- Automatischer Push in den Chrome Web Store (keine offizielle Publish-API für neue Extensions)
- Responsive/fluid Layout (YAGNI)
- Font-Größen-Slider (YAGNI)
- Firefox Add-ons Store (separates Vorhaben)
