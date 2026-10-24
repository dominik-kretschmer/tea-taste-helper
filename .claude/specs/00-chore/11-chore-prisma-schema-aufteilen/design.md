# Design: 11 – Prisma-Schema auf eine Datei pro Tabelle aufteilen

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-23)**

## Überblick

Prisma 7 liest ein Schema auch aus einem **Ordner**: `prisma.config.ts` zeigt mit `schema` auf den Ordner, und Prisma fügt alle `.prisma`-Dateien darin zu einem Schema zusammen. Relationen und Enums dürfen über Dateigrenzen hinweg verweisen; die Reihenfolge der Dateien spielt keine Rolle.

Die Aufteilung ist rein mechanisch: Jeder Block wandert unverändert in seine Datei. Am erzeugten SQL ändert sich nichts. Das belegt `prisma migrate diff` zwischen altem und neuem Schema.

**Offene Frage aus den Anforderungen, erledigt:** 05-Moderation hat ihr Datenmodell schon committet (`bd1e0e3`, Migration `0006_moderation`). Deren Models und Enums werden gleich mit aufgeteilt.

## Zielstruktur

Stand heute: 377 Zeilen, 12 Models, 9 Enums.

```
prisma/
  migrations/                           unverändert
  schema/
    schema.prisma                       generator, datasource, Kopfkommentar
    enums.prisma                        alle 9 Enums, gruppiert nach Bereich
    user.prisma
    session.prisma
    audit-log.prisma
    ingredient.prisma
    ingredient-version.prisma
    ingredient-version-translation.prisma
    tea.prisma
    tea-version.prisma
    tea-version-translation.prisma
    tea-version-ingredient.prisma        Verbindungstabelle TeaVersion ↔ Ingredient
    report.prisma
    catalog-event.prisma
```

**Enums in `enums.prisma`,** in derselben Reihenfolge wie bisher. Die bisherigen Bereichsüberschriften (`// 02 – Auth & Rollen` usw.) bleiben dort als Gliederung erhalten:

| Bereich | Enums |
|---|---|
| 02 – Auth & Rollen | `Role`, `AuditEvent` |
| 03 – Zutaten | `Caffeine` |
| 04 – Tees | `TeaKind`, `Visibility` |
| 05 – Moderation | `CatalogType`, `ReportReason`, `ReportStatus`, `CatalogEventKind` |

## Kommentare (AK-1.5)

- `///`-Kommentare an Models und Feldern wandern mit ihrem Model bzw. Feld.
- `//`-Kommentare in einem Model bleiben an ihrer Stelle.
- **Bereichsüberschriften** mit den Hinweisen auf SQL-Objekte, die Prisma nicht kennt, kommen an den Anfang der Datei, die das Objekt betrifft. So steht der Hinweis dort, wo man nachsieht:

| Hinweis (bisher in der Bereichsüberschrift) | neu am Kopf von |
|---|---|
| Erweiterung `pg_trgm` (0003) | `ingredient-version-translation.prisma` (dort steht der erste Trigramm-Index) |
| partieller Unique-Index `IngredientVersion_current_key` (0003) | `ingredient-version.prisma` |
| partieller Unique-Index `TeaVersion_current_key` (0004) | `tea-version.prisma` |
| partieller Unique-Index `Report_open_key` (0006) | `report.prisma` |
| CHECK `Ingredient_merged_not_hidden` (0006) | `ingredient.prisma` |
| CHECK `Tea_merged_not_hidden` (0006) | `tea.prisma` |
| Hinweis „neue Migrationen mit `--create-only` erzeugen und prüfen“ | `schema.prisma` (gilt für alle) |

Jede Model-Datei beginnt mit einer Zeile `// <Bereich>: <Zweck der Tabelle>`, z.B. `// 03 – Zutaten: eine vollständige Version einer Zutat`. Steht am Model schon ein `///`-Kommentar, übernimmt die Zeile dessen Inhalt nur kurz.

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `prisma/schema.prisma` | gelöscht | per `git mv` nach `prisma/schema/schema.prisma`, damit die Historie folgt |
| `prisma/schema/schema.prisma` | neu (verschoben) | `generator`, `datasource`, Kopfkommentar |
| `prisma/schema/enums.prisma` | neu | alle Enums |
| `prisma/schema/<model>.prisma` (12 Dateien) | neu | je ein Model |
| `prisma.config.ts` | geändert | `schema: 'prisma/schema'` |
| `scripts/datenmodell.mjs` | geändert | Tabellen und Enums alphabetisch sortieren, damit `docs/datenmodell.md` nicht von der Dateiaufteilung abhängt; nur noch Ordner lesen (*ergänzt in der Umsetzung*) |
| `docs/datenmodell.md` | geändert | einmalig umsortiert, Inhalt gleich |
| `test/unit/prisma-schema.test.ts` | neu | prüft die Regeln „eine Datei pro Tabelle“ und „Many-to-many nur als Verbindungstabelle“ (siehe Tests) |
| `README.md` | geändert | kurzer Absatz zur Ablage im Abschnitt zu den Datenbankobjekten; Projektstruktur `prisma/` |

Code außerhalb von `prisma/`, `prisma.config.ts`, README und dem neuen Test bleibt unverändert (AK-1.3).

## Konfiguration

```ts
// prisma.config.ts
export default defineConfig({
  // Ordner: eine Datei pro Tabelle, Enums in enums.prisma (00-chore/11)
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
})
```

```prisma
// prisma/schema/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../../server/generated/prisma"   // relativ zu dieser Datei, eine Ebene tiefer als bisher
}

datasource db {
  provider = "postgresql"
}
```

**Achtung `output`:** Der Pfad gilt relativ zur Datei mit dem `generator`-Block. Er muss von `../server/generated/prisma` auf `../../server/generated/prisma` wechseln, sonst landet der Client in `prisma/server/generated/` und alle Importe brechen.

Der Migrationsordner bleibt `prisma/migrations`; `migrations.path` in `prisma.config.ts` legt ihn ausdrücklich fest, deshalb muss er nicht neben `schema.prisma` liegen.

## Prüfung der Gleichwertigkeit (AK-1.2, AK-1.3)

1. **Vorher** das alte Schema sichern: `git show HEAD:prisma/schema.prisma > <scratch>/schema-alt.prisma`.
2. `npx prisma migrate diff --from-schema <scratch>/schema-alt.prisma --to-schema prisma/schema --exit-code` → Exit-Code 0 (leer). Zusätzlich mit `--script`: nur „empty migration“.
3. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code` → Exit-Code 0: Die Dev-DB entspricht dem neuen Schema, eine Migration ist nicht nötig. *Geändert in der Umsetzung:* Ursprünglich stand hier `migrate dev --create-only`. Das legt in Prisma 7 auch ohne Änderungen eine leere Migration an.
4. Erzeugten Client vergleichen: `server/generated/prisma` vorher und nachher per `diff -r`. Erwartet: Unterschiede höchstens im eingebetteten Schema-Text bzw. dessen Hash, nicht in Typen oder Modellen.
5. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün.

## Tests

`test/unit/prisma-schema.test.ts` liest `prisma/schema/*.prisma` und prüft die Ablageregel:

- `schema.prisma` enthält `generator` und `datasource`, aber kein `model` und kein `enum`.
- `enums.prisma` enthält nur `enum`-Blöcke.
- Jede andere Datei enthält **genau ein** `model`, und der Dateiname ist der Model-Name in kebab-case.
- Außerhalb von `enums.prisma` steht kein `enum`.
- **Keine implizite Many-to-many-Beziehung (AK-1.7):** Für jedes Listenfeld `feld B[]` in Model `A` sucht der Test im Model `B` die Gegenseite mit demselben Relationsnamen (`@relation("…")` bzw. ohne Namen). Ist auch die Gegenseite eine Liste (`A[]`), ist es eine implizite Many-to-many-Beziehung → Fehler mit dem Hinweis, eine Verbindungstabelle anzulegen. Bei 1:n ist die Gegenseite einzeln (`A` bzw. `A?`) und trägt `fields:`; das ist erlaubt (z.B. `Ingredient.mergedFrom Ingredient[]` ↔ `mergedInto Ingredient?`).

Der Test erkennt Blöcke per regulärem Ausdruck (`^(model|enum|generator|datasource)\s+(\w+)`). Das reicht, weil Prisma die Blöcke immer am Zeilenanfang erwartet.

## Entscheidungen

- **Eine Datei pro Model, Enums gesammelt** – Entscheidung des Nutzers vom 2026-10-23. Enums gesammelt, weil mehrere Models sie teilen (z.B. `Caffeine`, `CatalogType`).
- **Dateiname in kebab-case** – passt zu den übrigen mehrteiligen Dateinamen außerhalb von Vue-Komponenten (`request-log.ts`, `rate-limit.ts`, `password-change.global.ts`) und vermeidet Groß-/Kleinschreibungsprobleme unter Windows.
- **`git mv` für `schema.prisma`** – `git log --follow` zeigt die Historie von Generator und Datasource weiter. Die Models verlieren ihre Zeilenhistorie in jedem Fall; `git log -S '<model>'` findet sie im alten Pfad.
- **Hinweise auf SQL-only-Objekte an die betroffene Datei** – wer eine Tabelle nachschlägt, sieht sofort, dass es zusätzlich SQL gibt. – Verworfen: alle Hinweise in `schema.prisma` (wäre wieder eine Sammelstelle, die man kennen muss).
- **Unit-Test für die Ablageregel** – AK-1.6 verlangt, dass neue Tabellen gleich richtig angelegt werden. Eine Regel nur in der README vergisst man leicht; der Test meldet es sofort. Er ist billig und braucht keine DB. – Verworfen: keine Prüfung.
- ~~**Keine Übersichtsdatei**~~ – *geändert am 2026-10-23:* `docs/datenmodell.md` (Mermaid-ER-Diagramm) wird mit `scripts/datenmodell.mjs` aus dem Schema erzeugt. Das Skript liest schon heute wahlweise `prisma/schema/` oder `prisma/schema.prisma`, nach 11 also ohne Änderung. Ein Unit-Test vergleicht die Datei mit einer frisch erzeugten Fassung, damit sie nicht veraltet.
- **Many-to-many nur als Verbindungstabelle** – Entscheidung des Nutzers vom 2026-10-23: Jede Verbindung ist ein eigenes Model in einer eigenen Datei und damit in der Dateiliste sichtbar. Sie kann außerdem eigene Felder tragen (wie `position` und `percent` bei `TeaVersionIngredient`) und eigene Lösch-Regeln haben. – Verworfen: implizite Many-to-many-Beziehungen; Prisma legt dafür eine versteckte Tabelle `_AToB` an, die im Schema nicht als Datei auftaucht. Heute gibt es keine (alle 12 `CREATE TABLE` in den Migrationen gehören zu Models).

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | Zielstruktur `prisma/schema/`; `test/unit/prisma-schema.test.ts` |
| AK-1.2 | `prisma migrate diff --exit-code` leer, `migrate dev --create-only` ohne neue Migration |
| AK-1.3 | `output`-Pfad angepasst; Vergleich des erzeugten Clients; lint, typecheck, Tests, build |
| AK-1.4 | `prisma.config.ts` mit `schema: 'prisma/schema'`; `npm install` (postinstall), `db:migrate`, `db:deploy`, `db:studio` von Hand; `global-api.ts` (`migrate deploy`) über `npm test`; CI nach Push. `db:reset` wird **nicht** ausgeführt (leert die Dev-DB); es nutzt dieselbe Konfiguration wie `db:deploy`, und `prisma migrate status` bzw. `prisma validate` belegen, dass Konfiguration und Schema gefunden werden. |
| AK-1.5 | Blöcke unverändert verschoben; Tabelle „Kommentare“; Sichtprüfung per Diff der zusammengefügten Inhalte (siehe Aufgaben) |
| AK-1.6 | README-Absatz (Ablage- und Many-to-many-Regel); Regeln per Unit-Test abgesichert |
| AK-1.8 | `scripts/datenmodell.mjs` liest den Ordner; `npm run db:erd` ergibt dieselbe Datei (`git diff docs/datenmodell.md` leer); `test/unit/datenmodell.test.ts` grün |
| AK-1.7 | `TeaVersionIngredient` als eigene Datei; Unit-Test meldet implizite Many-to-many-Beziehungen |
