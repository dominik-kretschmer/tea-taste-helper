# 11 – Prisma-Schema auf eine Datei pro Tabelle aufteilen

> Chore-Issue zu [00-chore](../README.md). Phase 1: Anforderungen. Status: **freigegeben (2026-10-23)**

## Befund

`prisma/schema.prisma` enthält alles in einer Datei: Generator, Datasource, 5 Enums und 10 Models auf 241 Zeilen. Welche Tabellen es gibt, sieht man nur durch Scrollen oder Suchen. Mit 05-Moderation kommen weitere Models und Enums dazu (`Report`, `CatalogEvent` u. a.), die Datei wächst also weiter.

Prisma 7 kann das Schema auf mehrere `.prisma`-Dateien in einem Ordner verteilen. `prisma.config.ts` zeigt dafür auf den Ordner statt auf die Datei.

## Ziel

Ein Blick in `prisma/schema/` zeigt, welche Tabellen es gibt, und wer etwas über eine Tabelle wissen will, öffnet genau eine Datei. An der Datenbank ändert sich nichts.

## User Stories

- **US-1:** Als Entwickler möchte ich an den Dateinamen sehen, welche Tabellen es gibt, und für eine Tabelle gezielt die passende Datei öffnen, statt eine lange Schema-Datei zu durchsuchen.

## Akzeptanzkriterien

- **AK-1.1:** Das Schema liegt in `prisma/schema/`. `schema.prisma` enthält nur noch `generator` und `datasource`. Jedes Model steht in einer eigenen Datei, benannt nach dem Model in kebab-case (z.B. `User` → `user.prisma`, `IngredientVersionTranslation` → `ingredient-version-translation.prisma`). Alle Enums stehen in `enums.prisma`. `prisma/schema.prisma` gibt es nicht mehr.
- **AK-1.2:** WENN das neue Schema mit dem bisherigen verglichen wird (`prisma migrate diff`), DANN gibt es keinen Unterschied, und die Datenbank braucht keine neue Migration (`prisma migrate diff` zwischen Dev-DB und neuem Schema ist leer). *Präzisiert am 2026-10-23:* `prisma migrate dev --create-only` legt in Prisma 7 auch ohne Änderungen einen leeren Migrationsordner an und ist deshalb kein geeigneter Nachweis.
- **AK-1.3:** Der erzeugte Prisma-Client ist gleichwertig: `npm run typecheck`, alle Tests und `npm run build` bleiben grün, ohne Änderungen an Code außerhalb von `prisma/`.
- **AK-1.4:** `prisma.config.ts` zeigt auf den Ordner. `npm install` (postinstall), `npm run db:migrate`, `db:deploy`, `db:reset` und `db:studio` funktionieren wie bisher, ebenso der API-Test-Setup (`prisma migrate deploy`) und die CI.
- **AK-1.5:** Alle Kommentare (`///` und `//`) bleiben beim jeweiligen Model bzw. Feld erhalten, ebenso die Reihenfolge der Felder innerhalb eines Models.
- **AK-1.6:** README und Skill-Dateien (`.claude/skills/`) verweisen nirgends auf `prisma/schema.prisma` (Stand heute: keine Verweise; die Projektstruktur in der README nennt nur `prisma/`). Die README beschreibt kurz die Regeln „eine Datei pro Tabelle, Enums in `enums.prisma`, Many-to-many nur als Verbindungstabelle“, damit neue Tabellen gleich so angelegt werden.
- **AK-1.7:** Many-to-many-Beziehungen werden immer als **explizite Verbindungstabelle** angelegt, also als eigenes Model mit zwei Fremdschlüsseln in einer eigenen Datei (heute: `TeaVersionIngredient`). Implizite Many-to-many-Beziehungen (Listenfeld auf beiden Seiten, Prisma legt eine versteckte Tabelle `_AToB` an) gibt es nicht; ein automatischer Test meldet sie. *Ergänzt am 2026-10-23 auf Wunsch des Nutzers.*
- **AK-1.8:** `npm run db:erd` liest nach der Aufteilung den Ordner `prisma/schema/`. Die erzeugte `docs/datenmodell.md` ist inhaltlich unverändert (gleiches Schema), und `test/unit/datenmodell.test.ts` bleibt grün.

## Nicht im Umfang

- Änderungen an Feldern, Indizes, Relationen oder Enums.
- ~~Eine eigene Übersichtsdatei der Tabellen (bewusst entschieden: die Dateinamen reichen).~~ *Geändert am 2026-10-23 auf Wunsch des Nutzers:* Es gibt jetzt `docs/datenmodell.md` mit Mermaid-ER-Diagramm, Beziehungen und Enums. Die Datei wird per `npm run db:erd` aus dem Schema erzeugt und schon vor 11 eingeführt; siehe AK-1.8.
- Ältere Specs (01–05), die `prisma/schema.prisma` erwähnen; sie beschreiben den damaligen Stand.

## Offene Fragen

- keine. *Erledigt (2026-10-23):* 05-Moderation hat ihr Datenmodell vor der Umsetzung committet (`bd1e0e3`); deren Models werden mit aufgeteilt.
