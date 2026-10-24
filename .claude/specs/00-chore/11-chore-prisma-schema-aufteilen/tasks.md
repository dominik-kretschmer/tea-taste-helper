# Aufgaben: 11 – Prisma-Schema auf eine Datei pro Tabelle aufteilen

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23)**

Reihenfolge:
- Test für die Ablageregeln zuerst → Aufteilung mit Gleichwertigkeitsprüfung → README → Abnahme.
- Commits `test(00-chore/11): …` bzw. `refactor(00-chore/11): …`, nur mit ausdrücklich genannten Pfaden. Parallel arbeitet die Session für 05-Moderation; deren offene Dateien bleiben unberührt.
- Typecheck, Build und API-Tests nur unter `flock .git/tea-test.lock …`. Keinen zweiten Dev-Server starten (die Moderations-Session nutzt Port 3000).
- Vor Aufgabe 2 bei der Moderations-Session nachfragen, ob sie gerade am Schema arbeitet; während der Aufteilung darf niemand sonst `prisma/` ändern.

- [x] 1. Test für die Ablageregeln
  - Dateien: `test/unit/prisma-schema.test.ts` (neu)
  - Erfüllt: AK-1.1, AK-1.7 (Absicherung), AK-1.6
  - Prüfung: Der Test liest `prisma/schema/*.prisma` und prüft: `schema.prisma` nur `generator`/`datasource`; `enums.prisma` nur Enums; jede andere Datei genau ein Model mit passendem kebab-case-Namen; kein Enum außerhalb von `enums.prisma`; keine implizite Many-to-many-Beziehung. Vor Aufgabe 2 schlägt er fehl, weil es `prisma/schema/` noch nicht gibt. Gegenprobe für die Many-to-many-Regel mit einem Beispiel-Schema im Test selbst (zwei Models mit Listenfeld auf beiden Seiten → gemeldet; 1:n wie `mergedFrom`/`mergedInto` → nicht gemeldet).
  - Ergebnis: 4 Tests. Vor Aufgabe 2 scheitern die beiden Prüfungen des echten Ordners (`prisma/schema/` fehlt), die beiden Gegenproben sind grün: falscher Dateiname, zwei Models in einer Datei, Enum außerhalb von `enums.prisma` und `Post.tags ↔ Tag.posts` werden gemeldet; selbstbezogenes 1:n (`mergedFrom`/`mergedInto`) und eine Verbindungstabelle nicht.

- [x] 2. Schema aufteilen
  - Dateien: `prisma/schema.prisma` → `prisma/schema/schema.prisma` (per `git mv`), `prisma/schema/enums.prisma` und 12 Model-Dateien (neu), `prisma.config.ts`
  - Erfüllt: AK-1.1, AK-1.2, AK-1.3, AK-1.5, AK-1.7
  - Prüfung:
    1. Vorher sichern: altes Schema (`git show HEAD:prisma/schema.prisma`) und den erzeugten Client (`server/generated/prisma`) in den Scratchpad kopieren.
    2. Blöcke unverändert verschieben, Hinweise auf SQL-Objekte und Kopfzeile je Datei wie im Design, `output` auf `../../server/generated/prisma`.
    3. `npx prisma validate` grün. `npx prisma migrate diff --from-schema <alt> --to-schema prisma/schema --exit-code` → Exit-Code 0.
    4. Inhaltsvergleich: Jeder Model- und Enum-Block des neuen Schemas ist zeichengleich mit dem Block im alten Schema (Skript im Scratchpad vergleicht Block für Block, einschließlich `///`- und `//`-Kommentaren innerhalb der Blöcke). Kein Block fehlt, keiner ist doppelt.
    5. `npx prisma generate`; `diff -r` gegen den gesicherten Client: Unterschiede nur im eingebetteten Schema-Text bzw. Hash.
    6. Test aus Aufgabe 1 grün, `test/unit/datenmodell.test.ts` grün und `npm run db:erd` ändert `docs/datenmodell.md` nicht (`git diff` leer, AK-1.8).
  - Ergebnis: Aufgeteilt per Skript (Scratchpad), das bei unbekannten Zeilen außerhalb der Blöcke abbricht. `prisma validate` grün; `migrate diff` alt → neu: „No difference detected“, Exit 0; als Skript „empty migration“. Blockvergleich: 23 von 23 Blöcken (12 Models, 9 Enums, generator, datasource) zeichengleich inkl. `///`-Kommentaren davor; einzige Abweichung der gewollte `output`-Pfad. Erzeugter Client: Prisma ordnet die Models jetzt nach Dateinamen; nach Sortieren der Zeilen über den ganzen Client bleiben 5 Zeilen, alle nur Reihenfolge (`modelProps`-Union, eingebettetes Schema, daraus kodierte Daten, Laufzeit-Datenmodell). **Abweichung:** `docs/datenmodell.md` folgte der Lesereihenfolge der Dateien und war deshalb umsortiert. `scripts/datenmodell.mjs` sortiert Tabellen und Enums jetzt alphabetisch; altes Einzeldatei-Schema und neuer Ordner ergeben damit dieselbe Datei. Gegenüber HEAD ist die Datei einmalig umsortiert, die Zeilen sind inhaltlich identisch (sortierter Vergleich). Der Rückfall auf `prisma/schema.prisma` im Skript ist entfernt.

- [x] 3. README
  - Dateien: `README.md`
  - Erfüllt: AK-1.6
  - Prüfung: Kurzer Absatz (im Abschnitt „Datenmodell“): Schema liegt in `prisma/schema/`, eine Datei pro Tabelle in kebab-case, Enums in `enums.prisma`, Many-to-many nur als Verbindungstabelle in eigener Datei; nach Schemaänderungen `npm run db:erd`. Projektstruktur: `prisma/` mit `schema/` und `migrations/`. `grep -rn "prisma/schema.prisma" README.md .claude/skills` → keine Treffer.
  - Ergebnis: Regeln im Abschnitt „Datenmodell“, Projektstruktur mit `prisma/schema/` und `prisma/migrations/`. Keine Treffer für `prisma/schema.prisma` in README und `.claude/skills`. Zusätzlich nennt der Kopf von `prisma/schema/schema.prisma` die Regeln.

- [ ] 4. Abnahme
  - Erfüllt: alle
  - Prüfung: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` grün (AK-1.3; die API-Tests laufen mit `prisma migrate deploy` über das neue Schema, AK-1.4). Von Hand: `npm run postinstall` (`prisma generate && nuxt prepare`); ~~`npx prisma migrate dev --create-only --name probe` legt keinen Ordner an~~ `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code` → 0 (AK-1.2); `npm run db:deploy` → „No pending migrations“; `npm run db:studio` startet (Port prüfen, dann beenden). `db:reset` wird nicht ausgeführt (leert die Dev-DB); stattdessen zeigt `npx prisma migrate status`, dass Konfiguration, Schema und Migrationen gefunden werden und die DB aktuell ist. CI nach dem Push des Nutzers. AKs einzeln vermerken.
  - Ergebnis (2026-10-24, **teilweise**, auf Wunsch des Nutzers vor den API-Tests committet):
    - AK-1.1, AK-1.5, AK-1.7: siehe Aufgaben 1 und 2; `prisma validate` grün, `test/unit/prisma-schema.test.ts` grün.
    - AK-1.2: `migrate diff` alt → neu leer; `migrate diff --from-config-datasource --to-schema prisma/schema --exit-code` → 0 gegen die Dev-DB.
    - AK-1.3: Lint, Typecheck und 227 Unit-Tests grün (Unit-Tests am 2026-10-24 erneut). Kein Code außerhalb von `prisma/` geändert, abgesehen von Test, `scripts/datenmodell.mjs` und Doku.
    - AK-1.4: `postinstall`, `db:deploy` („No pending migrations“), `migrate status` (6 Migrationen, aktuell) und `db:studio` (HTTP 200) funktionieren. `db:reset` bewusst nicht ausgeführt.
    - AK-1.6: siehe Aufgabe 3. AK-1.8: `datenmodell.test.ts` grün, Inhalt gleich, einmalig umsortiert.
    - **Offen:** API-Tests und `npm run build` mit dem neuen Schema. Der erste Lauf scheiterte am Speicher (Hook-Timeout beim Bauen), der zweite fand keine Datenbank (`ECONNREFUSED`, Docker Desktop lief nicht). Nachholen, sobald Postgres läuft (`flock .git/tea-test.lock npx vitest run --project api --maxWorkers=1`), danach die CI nach dem Push.
    - Hinweis: `839bd68` (05-Moderation) enthielt versehentlich schon die Umbenennung `prisma/schema.prisma` → `prisma/schema/schema.prisma`, ohne die Änderung an `prisma.config.ts`. Erst dieser Commit macht HEAD wieder lauffähig.
