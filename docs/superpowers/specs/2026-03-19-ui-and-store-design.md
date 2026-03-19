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
| `.before` | `width` | `250px` | `350px` |
| `.after` | `width` | `250px` | `350px` |
| `#focus-vline` | `left` | `260px` | `360px` |

**ORP-Lineal-Berechnung:** `.before` (350px) + halbe `.orp`-Spalte (10px) = 360px. Die `.orp`-Spaltenbreite (20px) bleibt unverändert.

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

> **Manueller Schritt:** GitHub Pages in den Repository-Einstellungen aktivieren (Branch `main`, Ordner `/docs` oder `/`).

### 2.3 Store-Texte

**Neue Datei:** `docs/store-listing.md`

Enthält:
- **Kurzbezeichnung** (≤132 Zeichen, DE)
- **Ausführliche Beschreibung** (DE) mit Erklärung der RSVP-Methode, Funktionsumfang, Hinweis zu `<all_urls>`-Berechtigung
- **Begründung für `<all_urls>`** (für das Store-Review-Formular): Die Extension liest markierten Text von beliebigen Webseiten via Content Script — dies erfordert Zugriff auf alle URLs.

### 2.4 Gitea Build-Workflow

**Neue Datei:** `.gitea/workflows/build.yml`

Trigger: Push auf `main`

Schritte:
1. Repository auschecken
2. ZIP erstellen — enthält alle Extension-Dateien **außer**: `.git/`, `.gitea/`, `.idea/`, `docs/`, `tests/`, `*.md`
3. ZIP als Gitea Actions Artifact hochladen (manuell downloadbar aus dem Workflow-Run)

ZIP-Name: `speedreader-<version>.zip` (Version aus `manifest.json` ausgelesen)

---

## Manuelle Schritte (nicht automatisierbar)

| Schritt | Wer | Wann |
|---|---|---|
| Screenshots erstellen (1280×800 oder 640×400) | Nutzer | Vor Store-Einreichung |
| GitHub Pages aktivieren | Nutzer | Vor Store-Einreichung |
| Chrome Web Store Developer Account anlegen ($5) | Nutzer | Einmalig |
| ZIP aus Gitea herunterladen und im Store einreichen | Nutzer | Bei jedem Release |

---

## Nicht im Scope

- Automatischer Push in den Chrome Web Store (keine offizielle Publish-API für neue Extensions)
- Responsive/fluid Layout (YAGNI)
- Font-Größen-Slider (YAGNI)
- Firefox Add-ons Store (separates Vorhaben)
