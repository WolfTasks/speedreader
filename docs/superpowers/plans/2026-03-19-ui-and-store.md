# SpeedReader — UI & Chrome Web Store Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wortanzeige verbreitern + Schrift verkleinern, und alle Dateien für die Chrome Web Store Veröffentlichung erstellen (Icons, Privacy Policy, Store-Texte, Gitea Build-Workflow).

**Architecture:** Task 1 ist ein reines CSS-Edit. Tasks 2–5 erstellen neue Dateien für Store-Readiness. Alle Tasks sind unabhängig voneinander und können in beliebiger Reihenfolge ausgeführt werden, ausser Task 2 (Icons) muss vor Task 2b (manifest.json) abgeschlossen sein.

**Tech Stack:** Vanilla CSS, SVG, HTML, JSON, YAML (Gitea Actions)

---

## File Map

| Aktion | Datei | Zweck |
|--------|-------|-------|
| Modify | `reader/reader.css` | 6 CSS-Werte anpassen |
| Create | `icons/icon.svg` | Vektorquelle für Icons |
| Create | `icons/generate-pngs.html` | Browser-Helper zum PNG-Export (wird nicht deployed) |
| Create | `icons/icon-16.png` | Extension-Icon 16×16 |
| Create | `icons/icon-48.png` | Extension-Icon 48×48 |
| Create | `icons/icon-128.png` | Extension-Icon 128×128 |
| Modify | `manifest.json` | `icons` und `default_icon` ergänzen |
| Create | `docs/privacy-policy.html` | Datenschutzerklärung für Store |
| Create | `docs/store-listing.md` | Store-Texte zum Kopieren |
| Create | `.gitea/workflows/build.yml` | Automatischer ZIP-Build |

---

## Task 1: CSS — Wortanzeige verbreitern

**Files:**
- Modify: `reader/reader.css`

Die Änderungen beheben nebenbei einen bestehenden Defekt: die alten Werte (250+20+250=520px) passten nicht zur Container-Breite (540px), was einen 20px-Zentrierung-Versatz im ORP-Lineal erzeugte. Die neuen Werte sind exakt: 360+20+360=740px.

- [ ] **Schritt 1: CSS-Werte anpassen**

In `reader/reader.css` folgende 6 Werte ändern:

```css
/* #reader-container: max-width 640px → 808px */
#reader-container {
  max-width: 808px;   /* war: 640px */
  /* alle anderen Eigenschaften unverändert */
}

/* #word-display: width 540px → 740px */
#word-display {
  width: 740px;       /* war: 540px */
  /* alle anderen Eigenschaften unverändert */
}

/* #focus-vline: left 260px → 370px */
#focus-vline {
  left: 370px;        /* war: 260px  (neue Formel: .before 360px + .orp/2 10px) */
  /* alle anderen Eigenschaften unverändert */
}

/* #word-wrapper: font-size 2.4rem → 1.8rem */
#word-wrapper {
  font-size: 1.8rem;  /* war: 2.4rem */
  /* alle anderen Eigenschaften unverändert */
}

/* .before: width 250px → 360px */
.before {
  width: 360px;       /* war: 250px */
  /* alle anderen Eigenschaften unverändert */
}

/* .after: width 250px → 360px */
.after {
  width: 360px;       /* war: 250px */
  /* alle anderen Eigenschaften unverändert */
}
```

- [ ] **Schritt 2: Visuell verifizieren**

1. Extension in Chrome neu laden (`chrome://extensions/` → "Reload"-Symbol)
2. Beliebigen Text markieren → Rechtsklick → "Mit SpeedReader lesen"
3. Prüfen:
   - Box ist breiter als vorher
   - Schrift ist kleiner als vorher
   - Rote ORP-Linie steht exakt unter dem hervorgehobenen Buchstaben (nicht daneben)
   - Lange Wörter (z.B. "Bundesverfassungsgericht") werden nicht mehr abgeschnitten

- [ ] **Schritt 3: Unit-Tests prüfen**

`tests/reader-logic.html` im Browser öffnen. Alle Tests müssen weiterhin grün sein (die Logik in `reader-core.js` wurde nicht berührt).

- [ ] **Schritt 4: Commit**

```bash
git add reader/reader.css
git commit -m "fix: widen word display to 740px and reduce font to 1.8rem"
```

---

## Task 2: Icons erstellen

**Files:**
- Create: `icons/icon.svg`
- Create: `icons/generate-pngs.html`
- Create: `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png` (manuell generiert)
- Modify: `manifest.json`

Das "SR"-Monogramm verwendet die Extension-Farbpalette: `#e94560` (Rot/ORP) für "S", `#e0e0e0` (Hellgrau) für "R", `#1a1a2e` (Dunkelblau) als Hintergrund.

- [ ] **Schritt 1: SVG-Quelldatei erstellen**

Neue Datei `icons/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="16" fill="#1a1a2e"/>
  <text font-family="'Arial Black', Arial, sans-serif" font-size="68" font-weight="900" y="90">
    <tspan x="8" fill="#e94560">S</tspan><tspan fill="#e0e0e0">R</tspan>
  </text>
</svg>
```

- [ ] **Schritt 2: PNG-Generator-Helper erstellen**

Neue Datei `icons/generate-pngs.html` (wird nicht in den Store deployed):

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Icon-Generator</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; background: #f0f0f0; }
    button { padding: 0.5rem 1.5rem; font-size: 1rem; cursor: pointer; margin-top: 1rem; }
    #previews { display: flex; gap: 2rem; align-items: flex-end; margin: 1rem 0; }
    .preview-box { text-align: center; }
    .preview-box canvas { display: block; border: 1px solid #ccc; background: #fff; }
  </style>
</head>
<body>
  <h1>SpeedReader Icon Generator</h1>
  <p>Klicke "Generieren" — die drei PNGs werden automatisch heruntergeladen.<br>
     Verschiebe sie danach in den <code>icons/</code>-Ordner des Projekts.</p>
  <button onclick="generate()">PNGs generieren &amp; herunterladen</button>
  <div id="previews"></div>

  <script>
    const SIZES = [16, 48, 128];

    function generate() {
      const img = new Image();
      img.onload = () => {
        const previews = document.getElementById('previews');
        previews.innerHTML = '';
        SIZES.forEach(size => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, size, size);

          // Preview anzeigen
          const box = document.createElement('div');
          box.className = 'preview-box';
          box.appendChild(canvas);
          box.appendChild(document.createElement('br'));
          box.appendChild(document.createTextNode(`${size}×${size}`));
          previews.appendChild(box);

          // Download auslösen
          canvas.toBlob(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `icon-${size}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }, 'image/png');
        });
      };
      img.src = 'icon.svg';
    }
  </script>
</body>
</html>
```

- [ ] **Schritt 3: PNGs generieren**

1. `icons/generate-pngs.html` im Browser öffnen (Doppelklick auf die Datei)
2. "PNGs generieren & herunterladen" klicken
3. Drei Downloads erscheinen: `icon-16.png`, `icon-48.png`, `icon-128.png`
4. Alle drei Dateien in den `icons/`-Ordner des Projekts verschieben

> **Wichtig:** Die Downloads landen üblicherweise im Download-Ordner. Verschiebe sie manuell nach `icons/` im Projekt.

- [ ] **Schritt 4: manifest.json aktualisieren**

In `manifest.json` folgende Felder ergänzen:

```json
{
  "manifest_version": 3,
  "name": "SpeedReader",
  "version": "0.1.0",
  "description": "Lese Texte schneller mit der RSVP-Methode",
  "icons": {
    "16":  "icons/icon-16.png",
    "48":  "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
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
    "default_title": "SpeedReader",
    "default_icon": {
      "16":  "icons/icon-16.png",
      "48":  "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  }
}
```

- [ ] **Schritt 5: Visuell verifizieren**

1. Extension in Chrome neu laden
2. Extension-Icon in der Toolbar prüfen — das SR-Logo sollte sichtbar sein
3. `chrome://extensions/` → SpeedReader → Icon prüft sich auf der Übersichtsseite

- [ ] **Schritt 6: Commit**

```bash
git add icons/icon.svg icons/icon-16.png icons/icon-48.png icons/icon-128.png icons/generate-pngs.html manifest.json
git commit -m "feat: add SR extension icons and update manifest"
```

---

## Task 3: Privacy Policy

**Files:**
- Create: `docs/privacy-policy.html`

Diese Seite wird via GitHub Pages öffentlich gehostet. Die URL wird im Chrome Web Store als Privacy Policy URL eingetragen.

- [ ] **Schritt 1: Privacy Policy HTML erstellen**

Neue Datei `docs/privacy-policy.html`:

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SpeedReader – Datenschutzerklärung</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 680px;
      margin: 3rem auto;
      padding: 0 1.5rem;
      line-height: 1.7;
      color: #222;
    }
    h1 { font-size: 1.6rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; }
    p  { margin: 0.5rem 0; }
    footer { margin-top: 3rem; color: #888; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Datenschutzerklärung – SpeedReader</h1>
  <p><em>Stand: März 2026</em></p>

  <h2>Welche Daten werden erhoben?</h2>
  <p>SpeedReader erhebt <strong>keine persönlichen Daten</strong>. Die Extension überträgt keine Informationen an externe Server und führt keine Analyse des Nutzerverhaltens durch.</p>

  <h2>Wie wird Text verarbeitet?</h2>
  <p>Text, den du zum Lesen auswählst (z.B. markierter Text, Datei-Inhalt), wird ausschließlich lokal in deinem Browser gespeichert — in <code>chrome.storage.session</code> oder <code>chrome.storage.local</code>. Er wird sofort nach dem Anzeigen im Reader gelöscht und verlässt deinen Computer niemals.</p>

  <h2>Berechtigungen</h2>
  <p>SpeedReader benötigt Zugriff auf alle Webseiten (<code>&lt;all_urls&gt;</code>), damit du auf jeder beliebigen Seite Text markieren und mit dem Reader öffnen kannst. Die Extension liest dabei ausschließlich den von dir explizit ausgewählten Text.</p>

  <h2>Drittanbieter</h2>
  <p>Es werden keine Drittanbieter-Dienste, Tracking-Bibliotheken oder Werbenetzwerke eingebunden.</p>

  <h2>Kontakt</h2>
  <p>Bei Fragen zur Datenschutzerklärung kannst du ein Issue im Repository öffnen.</p>

  <footer>SpeedReader ist Open Source.</footer>
</body>
</html>
```

- [ ] **Schritt 2: Commit**

```bash
git add docs/privacy-policy.html
git commit -m "docs: add privacy policy for Chrome Web Store"
```

---

## Task 4: Store-Texte

**Files:**
- Create: `docs/store-listing.md`

- [ ] **Schritt 1: Store-Listing-Datei erstellen**

Neue Datei `docs/store-listing.md`:

```markdown
# SpeedReader — Chrome Web Store Listing

## Kategorie
Productivity

---

## Kurzbezeichnung (≤132 Zeichen — im Dashboard als "Short description" eintragen)

SpeedReader zeigt Texte Wort für Wort mit der RSVP-Methode — schneller lesen mit optimalem Fokuspunkt.

*(92 Zeichen)*

---

## Ausführliche Beschreibung

**SpeedReader – Schneller lesen mit der RSVP-Methode**

RSVP (Rapid Serial Visual Presentation) ist eine bewährte Lese­technik: Jedes Wort erscheint einzeln an einer festen Position im Blick­feld. Dein Auge muss nicht mehr über die Zeile wandern — du kannst dich voll auf den Inhalt konzentrieren und liest dadurch deutlich schneller.

**Funktionen:**

- Markierten Text auf jeder Webseite sofort vorlesen lassen (Rechtsklick → Kontextmenü)
- Texte aus `.txt`-, `.docx`- und `.pdf`-Dateien direkt im Browser öffnen
- Einzelne Seiten­elemente per Klick oder CSS-Selektor auswählen
- Lese­geschwindigkeit von 100 bis 800 Wörtern pro Minute stufenlos einstellen
- Optimaler Erkennungs­punkt (ORP): Der wichtigste Buchstabe jedes Worts wird rot hervorgehoben, damit dein Gehirn das Wort schneller erfasst
- Tastatur­steuerung: Leertaste für Play/Pause

**Datenschutz:**
SpeedReader speichert Text ausschließlich lokal in deinem Browser und überträgt nichts an externe Server.

---

## Begründung für die `<all_urls>`-Berechtigung
*(Im Submission-Formular in das Feld "Single-purpose justification" eintragen)*

The extension injects a content script to capture selected text and activated element text from any webpage the user is viewing. Access to all URLs is required because the user can invoke the reader on any website.

---

## Screenshots
- Mindestens 1 Screenshot erforderlich, maximal 5
- Erlaubte Maße: exakt **1280×800 px** oder **640×400 px** (keine anderen Maße)
- Empfohlene Inhalte:
  1. Reader in Aktion: Ein langes Wort mit rotem ORP-Buchstaben
  2. Popup mit allen vier Optionen (Auswahl, Picker, Selektor, Datei)

## Promotional Tile (optional, für Featured-Platzierungen)
- Maße: **440×280 px** PNG

---

## Einreichungs-Checkliste

- [ ] Developer-Account anlegen: https://chrome.google.com/webstore/devconsole ($5 Einmalgebühr)
- [ ] ZIP aus dem Gitea Workflow-Artifact herunterladen
- [ ] Neue Extension anlegen → ZIP hochladen
- [ ] Kurzbezeichnung eintragen (Short description)
- [ ] Ausführliche Beschreibung eintragen
- [ ] Kategorie: Productivity
- [ ] Screenshots hochladen (mindestens 1)
- [ ] Privacy Policy URL eintragen: `https://<dein-username>.github.io/speedreader/docs/privacy-policy.html`
- [ ] Single-purpose justification eintragen (siehe oben)
- [ ] Zur Review einreichen
```

- [ ] **Schritt 2: Commit**

```bash
git add docs/store-listing.md
git commit -m "docs: add Chrome Web Store listing texts and submission checklist"
```

---

## Task 5: Gitea Build-Workflow

**Files:**
- Create: `.gitea/workflows/build.yml`

Der Workflow läuft bei jedem Push auf `main`, erstellt ein ZIP der Extension-Dateien und stellt es als Artifact bereit.

> **Hinweis zu `runs-on`:** Der Wert `ubuntu-latest` setzt voraus, dass dein Gitea-Runner dieses Label hat. Falls dein Runner ein anderes Label verwendet, passe `runs-on` entsprechend an.

- [ ] **Schritt 1: Verzeichnis und Workflow-Datei erstellen**

Neues Verzeichnis `.gitea/workflows/` anlegen, darin neue Datei `build.yml`:

```yaml
name: Build Extension ZIP

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Get version from manifest
        id: version
        run: |
          VERSION=$(node -e "console.log(require('./manifest.json').version)")
          echo "version=${VERSION}" >> $GITHUB_OUTPUT

      - name: Create ZIP
        run: |
          zip -r "speedreader-${{ steps.version.outputs.version }}.zip" . \
            -x ".git/*" \
            -x ".gitea/*" \
            -x ".idea/*" \
            -x "docs/*" \
            -x "tests/*" \
            -x "CLAUDE.md" \
            -x "icons/generate-pngs.html" \
            -x "icons/icon.svg"

      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: speedreader-${{ steps.version.outputs.version }}
          path: speedreader-${{ steps.version.outputs.version }}.zip
          retention-days: 30
```

- [ ] **Schritt 2: Commit und Push**

```bash
git add .gitea/workflows/build.yml
git commit -m "ci: add Gitea Actions workflow to build extension ZIP"
git push
```

- [ ] **Schritt 3: Workflow-Run verifizieren**

1. Gitea-Repository im Browser öffnen
2. "Actions" Tab → den neuesten Run öffnen
3. Prüfen: alle Schritte sind grün
4. "Artifacts" → `speedreader-0.1.0` herunterladen
5. ZIP öffnen und prüfen: `manifest.json`, `background.js`, `popup/`, `reader/`, `vendor/`, `icons/*.png` sind enthalten; `docs/`, `tests/`, `CLAUDE.md`, `icon.svg`, `generate-pngs.html` sind **nicht** enthalten

---

## Manuell durch den Nutzer (nach Abschluss der obigen Tasks)

| Schritt | Beschreibung |
|---------|-------------|
| GitHub-Repo anlegen | Öffentliches Repo auf GitHub erstellen, `docs/`-Ordner pushen |
| GitHub Pages aktivieren | Repository Settings → Pages → Branch `main`, Ordner `/docs` |
| Privacy Policy URL prüfen | `https://<username>.github.io/speedreader/docs/privacy-policy.html` im Browser öffnen |
| Screenshots erstellen | Exakt 1280×800 oder 640×400 px, mind. 1, max. 5 |
| Store-Einreichung | Checkliste in `docs/store-listing.md` abarbeiten |
