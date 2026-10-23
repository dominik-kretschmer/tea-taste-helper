# 06 – Dunkelmodus: Hydration-Fehler, App bleibt hell

> Chore-Issue zu [00-chore](../README.md). Phase 1: Anforderungen. Status: **Entwurf – wartet auf Freigabe**

## Befund

`app/plugins/vuetify.ts` setzt `theme: { defaultTheme: 'system' }` („Hell/Dunkel folgt dem Betriebssystem“). Beim Server-Rendern ist das Systemthema unbekannt; der Server rendert hell, der Browser erwartet dunkel.

Nachgestellt am 2026-10-23 per Playwright mit `colorScheme: 'dark'` über alle Seiten:

- 15 (Gast) bzw. 19 (angemeldet) verschiedene Warnungen „Hydration class mismatch“ (`v-theme--light` ↔ `v-theme--dark`) pro Durchgang,
- die App bleibt trotzdem hell (`.v-application` hat `v-theme--light`, Hintergrund weiß).

Im hellen Modus gibt es keine dieser Warnungen. Die Funktion „folgt dem Betriebssystem“ wirkt also nicht und erzeugt Fehler.

## Ziel

Die App zeigt ein stimmiges Thema ohne Hydration-Fehler.

## User Stories

- **US-1:** Als Nutzer mit dunklem Systemthema möchte ich eine stimmige Darstellung ohne Flackern oder halb dunkle Elemente.

## Akzeptanzkriterien

- **AK-1.1:** WENN eine Seite im dunklen oder hellen Systemmodus geladen wird, DANN gibt es keine Hydration-Warnungen.
- **AK-1.2:** WENN das gewählte Verhalten „dunkel“ ergibt, DANN sind App-Hintergrund und Komponenten durchgehend dunkel (sonst durchgehend hell).
- **AK-1.3:** Die Prüfung aus dem Befund (alle Seiten, Gast und angemeldet, hell und dunkel) läuft ohne Hydration-Warnung.

## Nicht im Umfang

- Eigenes Farbschema oder Branding.

## Offene Fragen

- **Entscheidung nötig:** Wie soll sich das Thema verhalten?
  - (a) **Immer hell** – einfachste Lösung, keine Hydration-Probleme.
  - (b) **Folgt dem System** – der Server erfährt das Systemthema per Client-Hint (`Sec-CH-Prefers-Color-Scheme`) bzw. Cookie. Beim allerersten Besuch kann es einmal kurz hell aufblitzen.
  - (c) wie (b), dazu ein **Umschalter** hell/dunkel/System im Menü, gespeichert per Cookie.
