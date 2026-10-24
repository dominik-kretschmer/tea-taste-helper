# Aufgaben: 06 – Vorrat

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-24)**

Reihenfolge:
- Datenmodell → Regeln → Server-Bausteine → API → Moderation → UI → Dokumentation → Endabnahme.
- Jede Aufgabe bringt ihre Tests mit.
- Nach jeder Aufgabe folgt ein Commit `feat(06-vorrat): <Aufgabe>`.
- Gepusht wird nur nach Rücksprache.
- Zum Abschluss jeder Aufgabe laufen `npm run lint`, `npm run typecheck` und `npm test` grün.
- Browserprüfungen mit Testdaten unter der Kennung `pw06`, danach wieder aus der Dev-DB löschen.

- [x] 1. Datenmodell und Migration
  - Dateien: `prisma/schema/pantry-item.prisma` (neu), `prisma/schema/user.prisma`, `ingredient.prisma`, `tea.prisma` (Rückrelationen), `prisma/migrations/0007_pantry/` (per `--create-only`, ergänzt um `CHECK "PantryItem_one_target"`), `docs/datenmodell.md` (`npm run db:erd`)
  - Erfüllt: Grundlage für alle AKs, AK-4.2 (Cascade)
  - Prüfung:
    - `npm run db:migrate` auf Dev und `tea_test`.
    - `prisma migrate diff` gegen die DB ist leer. Die Migration löscht keines der SQL-Objekte aus 0003–0006.
    - Per SQL: Eine Zeile ohne Verweis und eine mit beiden Verweisen schlagen am `CHECK` fehl, ein doppelter Eintrag am Unique-Index.
    - `test/unit/prisma-schema.test.ts` und `datenmodell.test.ts` bleiben grün.
  - Ergebnis: Die Migration enthält nur `CREATE`/`ALTER … ADD` und kein `DROP`. Sie ist auf Dev angewendet, `tea_test` migriert das Test-Setup. `migrate diff` meldet „empty migration“. Per SQL schlagen „ohne Verweis“ und „beide Verweise“ am `PantryItem_one_target` fehl, ein doppelter Eintrag am `PantryItem_userId_ingredientId_key`. Lint und Typecheck grün, 420 Tests grün.

- [x] 2. Konstanten, Typen, zod-Schemas
  - Dateien: `shared/utils/pantry.ts`, `shared/types/pantry.ts`, `shared/schemas/pantry.ts`, `shared/schemas/tea.ts` (`withOwn`), `test/unit/pantry.test.ts`
  - Erfüllt: AK-2.5, Grundlage für AK-1.4, AK-1.5
  - Prüfung: Die Unit-Tests decken diese Grenzfälle ab: `grams` mit `null`, 0, 100 000 gültig, −1, 100 001, 1,5 und `"5"` ungültig. `type` nur `ingredient`/`tea`. `entityId` muss eine UUID sein.
  - Ergebnis: `test/unit/pantry.test.ts` mit 13 Tests grün. Fehlt die Menge beim Hinzufügen, gilt sie als `null` („ohne Menge“). Lint und Typecheck grün, alle 240 Unit-Tests grün. Die API-Tests laufen erst ab Aufgabe 4 wieder, weil sich bis dahin kein Serververhalten ändert.

- [x] 3. Server-Bausteine
  - Dateien: `server/utils/pantry.ts` (`listPantry`, `countPantry`, `findPantryEntry`, `loadPantryEntry`, `createPantryEntry`, `updatePantryEntry`, `mergePantry`, `pantryNotFound`), `server/utils/teas.ts` (`listTeas` mit `withOwn`)
  - Erfüllt: Grundlage für AK-1.1–1.5, AK-2.3, AK-2.4, AK-2.6, AK-5.1
  - Prüfung: Typecheck grün. Das Verhalten prüfen die API-Tests aus Aufgabe 4 und 5.
  - Ergebnis: Lint und Typecheck grün. Zusätzlich `deletePantryEntry`. `displayJoins` aus `ingredients.ts` heißt jetzt `ingredientDisplayJoins` und wird wie `teaDisplayJoins` exportiert. Abweichung vom Design: Lookup, POST und PATCH liefern `PantryRef` (`id`, `entityType`, `entityId`, `grams`) statt `PantryEntry`, denn ohne Namen brauchen sie keine Locale (design.md angepasst).

- [x] 4. Vorrats-API
  - Dateien: `server/api/pantry/index.get.ts`, `index.post.ts`, `lookup.get.ts`, `[id].patch.ts`, `[id].delete.ts`, `server/api/teas/index.get.ts` (falls `withOwn` dort weitergereicht werden muss), `i18n/locales/*.json` (`errors.ALREADY_IN_PANTRY`, `PANTRY_FULL`, `ENTRY_UNAVAILABLE`), `test/api/pantry.test.ts`
  - Erfüllt: AK-0.1, AK-0.2, AK-1.1–1.5, AK-2.1, AK-2.3–2.6, AK-3.1, AK-3.3, AK-4.2
  - Prüfung (API-Tests):
    - Jede Route gibt Gästen 401.
    - Fremde Eintrags-ID bei PATCH und DELETE ergibt 404. Die Liste zeigt nie fremde Einträge.
    - Liste: Tabs mit `counts`, Sortierung normal → aufgebraucht → ausgeblendet, Name in `en` mit Fallback, Suche über die Namen aller Sprachen und die Marke, Seite 2 bei 25 Einträgen.
    - Hinzufügen: 201. Ein zweites Mal ergibt 409 mit `entryId`. Fremder privater Tee, ausgeblendeter Eintrag und unbekannte ID ergeben 404, ein zusammengeführter Eintrag 404 mit `mergedInto`. Eigener privater Tee: 201. Beim 1 001. Eintrag kommt 400 `PANTRY_FULL` (Einträge per SQL anlegen).
    - PATCH: `null`, 0 und Werte ändern die Menge. Bei einem ausgeblendeten Ziel kommt 409 `ENTRY_UNAVAILABLE`.
    - DELETE: 204, danach ist der Eintrag weg. Ein erneutes POST mit derselben Menge stellt ihn wieder her.
    - Lookup: liefert `entry` bzw. `null`.
    - Löscht der Ersteller seinen privaten Tee, verschwindet er aus dem Vorrat.
    - `GET /api/teas?withOwn=1` liefert öffentliche und eigene private Tees, für Gäste nur öffentliche.
    - Pantry-Aktionen erzeugen keine Audit-Einträge.
  - Ergebnis: `test/api/pantry.test.ts` mit 15 Tests grün. `server/api/teas/index.get.ts` brauchte keine Änderung, weil `withOwn` mit der Query an `listTeas` geht und Gäste dort `viewer = null` haben. Lint und Typecheck grün, insgesamt 448 Tests grün.

- [x] 5. Zusammenführen hängt den Vorrat um
  - Dateien: `server/utils/moderation.ts` (`markMerged` → `mergePantry`), `test/api/pantry.test.ts` (bzw. `moderation.test.ts`)
  - Erfüllt: AK-5.1, AK-5.2, AK-5.3, AK-3.3
  - Prüfung (API-Tests):
    - Zutaten und Tees zusammenführen: Nur die Quelle im Vorrat → zeigt danach auf das Ziel. Quelle und Ziel im Vorrat → ein Eintrag bleibt, Mengen 30 + 20 = 50, `null` + 20 = 20, `null` + `null` = `null`, 90 000 + 20 000 = 100 000. Vorräte anderer Nutzer bleiben getrennt.
    - Ausblenden einer Zutat, die nur im Vorrat steckt, gelingt. Der Eintrag erscheint danach mit `hidden: true`, nach dem Wiederherstellen wieder normal.
    - Der Audit-Eintrag `*_MERGED` ist unverändert.
  - Ergebnis: 9 neue Tests in `test/api/pantry.test.ts`, alle grün. Ergänzt um den Fall 0 + 5 = 5 (eine aufgebrauchte Quelle zählt wie eine Menge). Lint und Typecheck grün, insgesamt 457 Tests grün.

- [x] 6. Teesuche mit eigenen privaten Tees, Menüeintrag, Route
  - Dateien: `app/components/moderation/EntrySearch.vue` (Prop `withOwn`), `app/components/UserMenu.vue`, `nuxt.config.ts` (`pantry`), `i18n/locales/*.json` (`nav.pantry`)
  - Erfüllt: AK-0.3, Grundlage für AK-2.1
  - Prüfung im Browser: Der Menüeintrag „Vorrat“ erscheint angemeldet und führt zu `/vorrat` bzw. `/en/pantry`. Als Gast leitet `/vorrat` zum Login und danach zurück. Die bestehenden Suchen (Melden, Zusammenführen) verhalten sich unverändert.
  - Ergebnis: Playwright auf dem Dev-Server bei 375 px. Ein Gast auf `/vorrat` landet auf `/login?redirect=/vorrat`, nach der Registrierung wieder auf `/vorrat`. Das Menü „Vorrat“ führt zu `/vorrat`, auf Englisch „Pantry“ zu `/en/pantry`. Keine Warnungen in der Konsole. `EntrySearch` hängt `withOwn` nur an, wenn die Prop gesetzt ist; die bestehenden Aufrufer setzen sie nicht, Melden und Zusammenführen bleiben also unverändert. Die Seite ist bis Aufgabe 7 ein Platzhalter. Icon `mdiPackageVariantClosed`.

- [x] 7. Vorratsseite
  - Dateien: `app/pages/pantry/index.vue`, `app/components/pantry/PantryEntryDialog.vue`, `app/components/pantry/PantryRemoveDialog.vue`, `i18n/locales/*.json` (`pantry.*`)
  - Erfüllt: AK-0.2, AK-1.1–1.4, AK-2.1, AK-2.3, AK-2.5, AK-3.1, AK-3.2, AK-4.1, AK-6.1, AK-6.2
  - Prüfung im Browser (de und en):
    - Leerer Vorrat zeigt den Hinweis.
    - Zutat ohne Menge und eigenen privaten Tee mit 50 g hinzufügen.
    - Dieselbe Zutat erneut hinzufügen: Meldung mit „Menge ändern“.
    - Ungültige Menge (−1, 100 001): Fehler am Feld.
    - „Aufgebraucht“ setzt den Eintrag auf 0 und schiebt ihn ans Ende.
    - Ausgeblendeter Eintrag: ohne Link, nur „Entfernen“.
    - Tabs, Suche und Seite stehen in der URL und überstehen ein Neuladen.
    - Entfernen mit Rückfrage, „Rückgängig“ stellt die Menge wieder her.
    - 375 px hell und dunkel ohne horizontales Scrollen. Keine Warnungen in der Konsole, keine CSP-Verstöße.
  - Ergebnis: Playwright auf dem Dev-Server bei 375 px (de und en), alle Punkte erfüllt. Der leere Vorrat zeigt den Hinweis, Zutat ohne Menge und privater Tee mit 50 g lassen sich hinzufügen (der Tab wechselt zum Tee). Ein zweites Hinzufügen meldet „Das steht schon in deinem Vorrat“ mit „Menge ändern“. −1 und 100 001 zeigen den Fehler am Feld. „Aufgebraucht“ schiebt den Eintrag ans Ende. Ein ausgeblendeter Eintrag hat keinen Link und im Menü nur „Entfernen“. Tab, Suche und Seite überstehen ein Neuladen. Entfernen mit Rückfrage, „Rückgängig“ stellt 1 250 g wieder her. Kein horizontales Scrollen hell und dunkel. In der Konsole steht nur die erwartete 409-Antwort des doppelten Hinzufügens. Hilfsfunktion `parseGrams` in `app/utils/format.ts`, `usePantryAmount` für den Mengentext. Lint, Typecheck und 240 Unit-Tests grün.

- [ ] 8. Knopf auf den Detailseiten
  - Dateien: `app/components/pantry/PantryButton.vue`, `app/pages/ingredients/[id]/index.vue`, `app/pages/teas/[id]/index.vue`
  - Erfüllt: AK-2.2
  - Prüfung im Browser:
    - Gast sieht keinen Knopf.
    - Angemeldet: „In den Vorrat“, danach „Im Vorrat: 50 g“ mit Link auf den passenden Tab.
    - Als Moderator auf einem ausgeblendeten Eintrag: kein Knopf.
    - Die Detailseite lädt per SSR ohne Wartezeit auf das Lookup.

- [ ] 9. Dokumentation
  - Dateien: `README.md` (Abschnitt Vorrat, `PantryItem_one_target` in der Liste der SQL-Objekte), `.claude/specs/00 – Overview: tea-taste-helper.md` (§6 um Gramm, „aufgebraucht“ und Verhalten bei der Moderation ergänzen)
  - Erfüllt: –
  - Prüfung: Die README-Liste der SQL-Objekte stimmt mit den Migrationen überein.

- [ ] 10. Endabnahme
  - `npm run build` fehlerfrei, `lint`, `typecheck` und `test` grün.
  - Jedes AK einzeln prüfen und als Tabelle (AK | Ergebnis | Nachweis) hier eintragen.
  - Status in requirements, design und tasks auf **umgesetzt** setzen. Testdaten `pw06` aus der Dev-DB löschen.
