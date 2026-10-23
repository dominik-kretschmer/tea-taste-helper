# 05 – npm audit meldet 11 Lücken mit Schweregrad „high“

> Chore-Issue zu [00-chore](../README.md). Phase 1: Anforderungen. Status: **Entwurf – wartet auf Freigabe**

## Befund

`npm audit` (2026-10-23): 11 × high, 0 critical. Alle indirekt über `nuxt`:

| Paket | Problem | Weg |
|---|---|---|
| `braces`, `micromatch`, `fast-glob`, `globby` | DoS durch tief verschachtelte Muster | `nitropack` → `globby` |
| `node-forge` | RSA-Signaturprüfung akzeptiert zusätzliche Elemente | `nitropack` → `listhen` |

npm schlägt als „Fix“ `nuxt@4.1.3` vor – ein **Downgrade** von 4.6.2, also unbrauchbar. Dependabot hat dafür keinen PR erzeugt. Die betroffenen Pakete laufen vor allem beim Bauen und im Dev-Server (`listhen`); ob etwas davon im gebauten Server landet, ist noch zu prüfen.

## Ziel

Die gemeldeten Lücken sind bewertet und, wo möglich, behoben; die CI meldet neue Lücken künftig selbst.

## User Stories

- **US-1:** Als Entwickler möchte ich wissen, ob die gemeldeten Lücken die laufende App betreffen, und sie ohne Downgrade beheben.

## Akzeptanzkriterien

- **AK-1.1:** Für jedes gemeldete Paket ist festgehalten, ob es im gebauten Server (`.output`) enthalten ist.
- **AK-1.2:** WENN eine gepatchte Version existiert, DANN wird sie per `overrides` (oder Update) eingesetzt, ohne Nuxt herabzustufen; danach meldet `npm audit` für dieses Paket nichts mehr.
- **AK-1.3:** WENN kein Patch existiert, DANN ist die Ausnahme mit Begründung dokumentiert.
- **AK-1.4:** Lint, Typecheck, alle Tests und `npm run build` bleiben grün.
- **AK-1.5:** Die CI führt `npm audit --omit=dev --audit-level=high` aus und schlägt bei neuen Lücken im Laufzeit-Code fehl.

## Nicht im Umfang

- Allgemeine Paket-Updates ohne Bezug zu den Meldungen.

## Offene Fragen

- Soll die CI auch bei Lücken in Dev-Abhängigkeiten fehlschlagen oder nur warnen? Vorschlag: nur Laufzeit (`--omit=dev`) bricht ab.
