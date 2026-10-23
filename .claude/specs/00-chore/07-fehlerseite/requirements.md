# 07 – Eigene Fehlerseite und sichtbare Ladefehler

> Chore-Issue zu [00-chore](../README.md). Phase 1: Anforderungen. Status: **Entwurf – wartet auf Freigabe**

## Befund

- Es gibt kein `app/error.vue`. Unbekannte Seiten und 404/500 zeigen die Standardseite von Nuxt: englisch („Go back home“), ohne App-Bar, Navigation und Sprachumschalter, im hellen Nuxt-Design. Für Zutaten heißt die Meldung seit 03 zwar „Nicht gefunden.“, steht aber auf dieser englischen Seite.
- Die Zutatenliste (`app/pages/ingredients/index.vue`) zeigt bei einem API-Fehler (z.B. DB nicht erreichbar) einfach nichts an – keine Liste, keine Meldung. Nachgestellt mit einem Server ohne DB: Seite 200, nur der Gast-Hinweis sichtbar.
- Die Admin-Listen verhalten sich ähnlich (leere Tabelle).

## Ziel

Fehler erscheinen in der App-Gestaltung, übersetzt und mit einem Weg zurück; Ladefehler auf Listen sind als Fehler erkennbar.

## User Stories

- **US-1:** Als Besucher möchte ich bei einer falschen Adresse eine verständliche Seite in meiner Sprache mit Navigation sehen, damit ich weiterkomme.
- **US-2:** Als Nutzer möchte ich erkennen, ob eine Liste leer ist oder nicht geladen werden konnte.

## Akzeptanzkriterien

- **AK-1.1:** WENN eine unbekannte Seite oder eine nicht vorhandene Zutat aufgerufen wird, DANN erscheint eine Fehlerseite mit App-Bar, Sprachumschalter, übersetztem Titel („Seite nicht gefunden“ / „Page not found“), HTTP-Status 404 und einem Link zur Startseite in der aktuellen Sprache.
- **AK-1.2:** WENN ein Serverfehler (500) beim Rendern auftritt, DANN erscheint dieselbe Fehlerseite mit übersetzter Meldung ohne technische Details.
- **AK-1.3:** WENN die Zutatenliste nicht geladen werden kann, DANN erscheint eine übersetzte Fehlermeldung mit „Erneut versuchen“, nicht die Meldung „Keine Zutaten gefunden“.
- **AK-1.4:** Dasselbe gilt für die Nutzer- und Audit-Liste im Admin-Bereich.
- **AK-1.5:** Alle neuen Texte in `de.json` und `en.json`; bei 360 px kein horizontales Scrollen; keine CSP-Verstöße.

## Nicht im Umfang

- Fehlerberichte an externe Dienste.

## Offene Fragen

- Soll die 404-Seite eine Suche oder Links (Zutaten) anbieten oder reicht „Zur Startseite“?
