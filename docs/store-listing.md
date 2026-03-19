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
