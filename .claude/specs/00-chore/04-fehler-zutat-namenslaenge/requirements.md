# 04 – Zutatennamen, die beim Kleinschreiben länger werden, führen zu 500

> Chore-Issue zu [00-chore](../README.md). Phase 1: Anforderungen. Status: **freigegeben (2026-10-23)**

## Befund

Der Name ist auf 80 Zeichen begrenzt (zod und `VARCHAR(80)`). Der daraus gebildete `nameKey` (`normalizeName`) steht ebenfalls in `VARCHAR(80)`. Manche Zeichen werden beim Kleinschreiben länger: `'İ'.toLocaleLowerCase('und')` ergibt zwei Zeichen.

Nachgestellt am 2026-10-23: `POST /api/ingredients` mit `name: 'İ' × 80` → **500 INTERNAL_ERROR**, im Log „value too long for type character varying(80)“. Dasselbe gilt für das Umbenennen und Übersetzen per `PATCH`.

## Ziel

Jeder Name, den die Eingabeprüfung akzeptiert, lässt sich auch speichern.

## User Stories

- **US-1:** Als Nutzer möchte ich bei jedem gültigen Namen eine verständliche Antwort bekommen, nie einen Serverfehler.

## Akzeptanzkriterien

- **AK-1.1:** WENN ein Name die Eingabeprüfung besteht (2–80 Zeichen nach dem Trimmen), DANN wird er gespeichert – auch wenn sein `nameKey` länger wird (z.B. 80 × „İ“).
- **AK-1.2:** Die Duplikatregel (03, AK-2.3) gilt für solche Namen unverändert.
- **AK-1.3:** Es gibt einen API-Test für Anlegen und Umbenennen mit 80 × „İ“ und einen Unit-Test für die Länge von `normalizeName`.
- **AK-1.4:** Bestehende Daten bleiben erhalten (Migration ohne Datenverlust).

## Nicht im Umfang

- Andere Längenbegriffe (Grapheme statt Code-Units) für die Eingabeprüfung.

## Offene Fragen

- keine (Lösungsweg, z.B. breitere Spalte, im Design)
