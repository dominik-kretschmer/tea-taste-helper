# Aufgaben: 05 – Moderation

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23), in Umsetzung**

Reihenfolge:
- Herauslösungen ohne Verhaltensänderung → Datenmodell → Regeln → Server-Bausteine → API → UI → Dokumentation → Endabnahme.
- Jede Aufgabe bringt ihre Tests mit.
- Nach jeder Aufgabe folgt ein Commit `feat(05-moderation): <Aufgabe>` bzw. `refactor(05-moderation): …` für die Herauslösungen.
- Gepusht wird nur nach Rücksprache.
- Zum Abschluss jeder Aufgabe laufen `npm run lint`, `npm run typecheck` und `npm test` grün.
- Browserprüfungen mit Testdaten unter der Kennung `pw05`, danach wieder aus der Dev-DB löschen.

- [x] 1. `save*Version` aus den PATCH-Routen herauslösen
  - Dateien: `server/utils/ingredients.ts` (`saveIngredientVersion`), `server/utils/teas.ts` (`saveTeaVersion`), `server/api/ingredients/[id]/index.patch.ts`, `server/api/teas/[id]/index.patch.ts`
  - Erfüllt: Grundlage für AK-1.3, AK-4.3, AK-7.2
  - Prüfung: Keine Verhaltensänderung. Diff, optimistisches Sperren, Duplikatregel und P2002 → `EDIT_CONFLICT` sitzen in der Funktion; die PATCH-Routen behalten Rechte, Rate-Limit und Audit. Alle bisherigen Tests bleiben unverändert grün.
  - Ergebnis: 336 Tests unverändert grün, Lint und Typecheck grün. `saveTeaVersion` prüft die Zutaten, sobald der Diff eine Zutatenänderung enthält (statt „Zutaten wurden mitgeschickt“). Beides ist gleichwertig, weil unveränderte Zutaten schon existieren. Bei einem Konflikt lesen beide Funktionen die aktuelle Versionsnummer neu, damit `details.currentVersion` stimmt.

- [x] 2. `RevisionList` aus den Historie-Seiten herauslösen
  - Dateien: `app/components/catalog/RevisionList.vue`, `app/pages/ingredients/[id]/history.vue`, `app/pages/teas/[id]/history.vue`
  - Erfüllt: Grundlage für AK-1.1, AK-5.6
  - Prüfung im Browser: Beide Historien verhalten sich wie vorher (Radio-Auswahl, Vergleich, Seiten, 360 px); keine Konsolenwarnungen.
  - Ergebnis: Playwright auf dem Dev-Server: Tee mit 3 Versionen (de 1280 px, en 360 px) und Zutat mit 1 Version. Radio-Auswahl wechselt den Vergleich („Version 2 → 1“), kein horizontales Scrollen, keine Warnungen oder Fehler in der Konsole. Die Seiten verlieren je 61 Zeilen, das Styling liegt jetzt in der Komponente.

- [x] 3. Datenmodell und Migration
  - Dateien: `prisma/schema.prisma`, `prisma/migrations/0006_moderation/` (per `--create-only`, ergänzt um `Report_open_key` und die beiden CHECK-Constraints), `shared/utils/roles.ts`, `shared/types/auth.ts` (13 Audit-Ereignisse), `i18n/locales/*.json` (Audit-Texte)
  - Erfüllt: Grundlage für alle AKs, AK-8.1 (Ereignistypen)
  - Prüfung:
    - `npm run db:migrate` auf Dev und `tea_test`.
    - `prisma migrate diff` gegen die DB ist leer; `migrate dev` meldet „Already in sync“.
    - Die Migration enthält kein `DROP`. Partieller Index und CHECK-Constraints sind vorhanden, die Indizes aus 0003/0004 unangetastet.
    - Bestehende Tests grün.
  - Ergebnis: Ordner `0006_moderation` (von Prisma erzeugt, umbenannt wie 0001–0005, ergänzt um `Report_open_key`, `Ingredient_merged_not_hidden`, `Tea_merged_not_hidden`). Kein `DROP`. Dev-DB: `migrate status` aktuell, `migrate diff` leer, alle partiellen Indizes und GIN-Indizes aus 0003/0004 sowie die neuen Objekte vorhanden; die Test-DB migriert `globalSetup` per `migrate deploy`. 336 Tests grün.

- [x] 4. Typen, Regeln und Schemas
  - Dateien: `shared/types/moderation.ts`, `shared/types/catalog.ts` (`RevisionEntry`-Felder, `ModerationState`), `shared/utils/moderation.ts` (`BLOCK_DURATIONS`, `blockedUntil`, `isBlocked`, `combineIngredients`), `shared/schemas/moderation.ts`, `shared/schemas/catalog.ts` (`revertSchema`), `app/composables/useFormErrors.ts` (falls neue Codes nötig), `test/unit/moderation.test.ts`
  - Erfüllt: AK-2.1, AK-2.2 (Regel), AK-4.3 (Regel), AK-6.1, AK-6.3 (Regel), AK-9.1
  - Prüfung (Unit-Tests):
    - `reportSchema`: Kommentar Pflicht bei `other`, Original Pflicht bei `duplicate` und verworfen bei anderen Gründen, 500/501 Zeichen.
    - `blockSchema`, `hideSchema` (leerer Grund → Fehler), `revertSchema`.
    - `blockedUntil` für alle Dauern; `isBlocked` (nie gesperrt, unbefristet, läuft noch, abgelaufen).
    - `combineIngredients`: nur Quelle, beide mit beiden/einem/keinem Anteil, Position des Ziels bleibt, Reihenfolge der übrigen.
  - Ergebnis: 24 Unit-Tests grün (Unit gesamt 222), Lint und Typecheck grün. Zusätzlich Schemas für die Listenabfragen (`reportListQuerySchema`, `hiddenListQuerySchema`, `moderationUsersQuerySchema`, `mergePreviewQuerySchema`); `bulkRevertSchema` lehnt Daten in der Zukunft ab. Abweichung: Die neuen `RevisionEntry`-Felder kommen erst mit Aufgabe 6, zusammen mit den Revisions-Routen, die sie füllen – sonst wäre der Typ zwischendurch falsch. `useFormErrors` braucht keine neuen Codes (`required` gibt es schon).

- [x] 5. Zustand „aktiv“ in allen bestehenden Abfragen
  - Dateien: `server/utils/ingredients.ts`, `server/utils/teas.ts` (`ACTIVE`, `activeSql`; Liste, Suche, `similar`, Detail, Duplikatregel, „Enthalten in“; `assertIngredientsExist` nur aktive, mit `FOR SHARE`), `server/utils/catalog.ts` (`CatalogType`, `assertEntryActive`, `lockEntry`, `recordCatalogEvent`), `server/api/{ingredients,teas}/[id]/{index.get,revisions.get,compare.get,index.patch}.ts`
  - Erfüllt: AK-4.2, AK-5.1, AK-5.3 (Abfragen), AK-5.4 (Detail für Moderatoren)
  - Prüfung (API-Tests, Zustand per Prisma in der Test-DB gesetzt):
    - Ausgeblendet: Detail, Historie, Vergleich und PATCH → 404 für Gast und Nutzer; Detail für Moderatoren 200 mit `moderation`.
    - Weder in Liste, Suche, `similar`, Zutatenfilter noch in „Enthalten in“.
    - Name wieder frei.
    - Zusammengeführt: Detail 404 mit `mergedInto`, mit `?merged=1` 200; Historie lesbar.
    - Tee speichern mit ausgeblendeter Zutat → 400 `INGREDIENT_NOT_FOUND`.
    - Bestehende Tests grün.
  - Ergebnis: 7 neue API-Tests in `moderation.test.ts`, gesamt 367 grün; Lint und Typecheck grün. Umsetzung:
    - `loadCurrent`/`loadCurrentTea` liefern inaktive Einträge nur mit `includeInactive`. Dadurch sind PATCH, Veröffentlichen und Löschen ohne weitere Änderung 404 – auch für Moderatoren.
    - Lesende Routen gehen über `assertReadable` (`server/utils/catalog.ts`) bzw. `loadReadableIngredient`/`loadReadableTea`.
    - Die Bedingung heißt `ENTRY_ACTIVE` (Prisma) bzw. `activeSql('i' | 't')` (SQL) und gilt für Zutaten und Tees gemeinsam, weil `server/utils` global importiert wird und zwei `ACTIVE` kollidieren würden.
    - `?merged=1` prüft `detailQuerySchema`.
    - `insertIngredient` und `setRole` liegen jetzt in `test/api/helpers.ts`.

- [x] 6. API: Zurücksetzen
  - Dateien: `server/api/ingredients/[id]/revert.post.ts`, `server/api/teas/[id]/revert.post.ts`, `server/utils/teas.ts` (`revertedTeaSnapshot`), `server/utils/ingredients.ts` (`resolveMerged`), Revisions-Routen (Felder `revertedTo`, `bulkRevertOf`, `mergedIngredient`), `test/api/revert.test.ts`
  - Erfüllt: AK-1.1–AK-1.6, AK-8.1 (`*_REVERTED`)
  - Prüfung (API-Tests):
    - Zutat → neue Version mit `revertedTo`, Inhalt gleich Zielversion inkl. Übersetzungen, Notiz nur die eigene.
    - Tee mit Zutaten, Reihenfolge und Anteilen; Zielversion privat → Tee bleibt öffentlich.
    - Konflikt 409; keine Änderung → `changed: false`; Zielversion = aktuelle oder unbekannt → 400.
    - Duplikat 409; Rate-Limit gemeinsam mit Bearbeiten.
    - Fremder privater Tee 404, eigener ok; Gast 401.
    - Zusammengeführte Zutat → Zielzutat; ausgeblendete → 409 `INGREDIENT_UNAVAILABLE`.
    - Audit mit `revertedTo` und `private`.
  - Ergebnis: 11 API-Tests in `revert.test.ts`, gesamt 378 grün. Ungültige Ziele (aktuelle oder unbekannte Version) → 400 `INVALID_REVERT_TARGET`.
    - Die Kennzeichnungen stehen über `VersionMarks` an `write*Version`/`save*Version`. `RevisionEntry` hat jetzt `revertedTo`, `bulkRevertOf` und `mergedIngredient` (aus Aufgabe 4 hierher verschoben).
    - Zwei bestehende Historie-Tests (`ingredients.test.ts`, `teas.test.ts`) prüfen die Versionszeilen per `toEqual`; dort sind die neuen Felder als `null` ergänzt, sonst nichts geändert.

- [x] 7. API: Melden und Meldungen
  - Dateien: `server/api/reports/index.post.ts`, `server/api/admin/reports/{index.get,resolve.post,count.get}.ts`, `server/utils/moderation.ts` (`closeReports`), `test/api/moderation.test.ts`
  - Erfüllt: AK-0.2 (Meldungsrouten), AK-2.1–AK-2.6, AK-3.1, AK-3.3, AK-3.5, AK-8.1 (`REPORT_*`), AK-9.2
  - Prüfung (API-Tests):
    - Melden → 201; Doppelmeldung 409 `ALREADY_REPORTED`, nach Abschluss wieder möglich.
    - Privater, ausgeblendeter oder zusammengeführter Eintrag → 404; Duplikat ohne Original, mit sich selbst oder anderer Art → 400.
    - 11. Meldung in einer Stunde → 429; Gast 401.
    - Liste: gruppiert, älteste zuerst, 25 Gruppen, Filter Grund/Art, Tab „Abgeschlossen“; `lastAuthor` richtig.
    - Abschließen erledigt/abgelehnt mit Notiz; ohne offene Meldungen 404.
    - `count` zählt Einträge, nicht Meldungen.
    - Gast 401, Nutzer 403 auf allen Admin-Routen.
    - Audit ohne Kommentar.
  - Ergebnis: 9 neue API-Tests (`moderation.test.ts` jetzt 16), Lint und Typecheck grün.
    - Ein ungültiges Duplikat-Original (gleich, andere Art, privat, inaktiv) antwortet mit 400 `VALIDATION_ERROR` am Feld `duplicateOfId`.
    - Das Rate-Limit zählt erst nach der Existenzprüfung, damit 404 nicht verbraucht.
    - Die Listen nehmen `locale` für die Namen. `loadEntryInfos` benennt Einträge beider Arten, auch inaktive.

- [x] 8. API: Ausblenden und Wiederherstellen
  - Dateien: `server/api/admin/[type]/[id]/{hide,restore}.post.ts`, `server/api/admin/hidden.get.ts`, `server/utils/moderation.ts` (`hideEntry`, `restoreEntry`), `server/utils/ingredients.ts` (`countTeasUsing`), Revisions-Routen (`events`), Tests in `moderation.test.ts`
  - Erfüllt: AK-0.2 (Routen), AK-3.4 (Ausblenden), AK-5.1, AK-5.2, AK-5.4–AK-5.7, AK-8.1 (`*_HIDDEN`, `*_RESTORED`)
  - Prüfung (API-Tests):
    - Ausblenden → 204, danach Verhalten wie in Aufgabe 5; Grund Pflicht.
    - Zutat in öffentlichem oder privatem Tee → 409 `INGREDIENT_IN_USE` mit Anzahl.
    - Privater Tee 404; `:type` unbekannt 404.
    - Offene Meldungen werden `resolved`.
    - Liste „Ausgeblendet“ neueste zuerst mit Grund und Moderator.
    - Wiederherstellen → wieder sichtbar und unverändert, nicht ausgeblendet → 404, neues Duplikat → 409.
    - `events` in der Historie, Grund nur für Moderatoren.
    - Gleichzeitig Ausblenden und Tee-Speichern mit dieser Zutat → genau eines gelingt.
    - Löschen privater Tees unverändert.
    - Gast 401, Nutzer 403.
  - Ergebnis: 8 neue API-Tests (`moderation.test.ts` jetzt 24), gesamt 395 grün.
    - Der Wettlauf läuft über 3 Runden: Es endet immer mit 204/400 oder 201/409, nie mit beiden Erfolgen (`FOR UPDATE` beim Ausblenden, `FOR SHARE` in `assertIngredientsExist`).
    - `countTeasUsing` zählt aktuelle Versionen aller nicht zusammengeführten Tees, also auch ausgeblendete: Sie könnten wiederhergestellt werden.
    - Die Historie liefert `RevisionPage` mit `events`.

- [x] 9. API: Zusammenführen
  - Dateien: `server/api/admin/[type]/[id]/merge.{get,post}.ts`, `server/utils/moderation.ts` (`mergeIngredients`, `mergeTeas`), Tee-Vergleich (`mergedInto` je Zutat), Tests in `moderation.test.ts`
  - Erfüllt: AK-0.2 (Routen), AK-3.4 (Zusammenführen), AK-4.1–AK-4.7, AK-8.1 (`*_MERGED`)
  - Prüfung (API-Tests):
    - Vorschau: beide Details, Anzahl öffentlicher/privater Tees, `missingTranslations`; gleich, inaktiv oder privat → 400/404.
    - Zutat zusammenführen: öffentliche und private Tees bekommen eine neue Version mit Ziel an gleicher Stelle, Moderator als Autor, `mergedIngredientId`.
    - Tee mit Quelle und Ziel → eine Zeile mit addierten Anteilen.
    - Alte Versionen unverändert; Vergleich zeigt `mergedInto`.
    - Quelle 404 mit `mergedInto`, nicht in Liste/Suche/`similar`.
    - Kette A→B, dann B→C → A zeigt auf C.
    - Meldungen geschlossen; Audit mit Zählern, kein `TEA_UPDATED`.
    - Gleichzeitiges PATCH eines betroffenen Tees → 409 statt Verlust.
    - Tee-Zusammenführung.
    - Gast 401, Nutzer 403.
  - Ergebnis: 7 neue API-Tests (`moderation.test.ts` jetzt 31), gesamt 402 grün. Ungültige Paare → 400 `INVALID_MERGE`, unbekannte Quelle → 404.
    - Abweichung vom Design (AK-4.7): Unter READ COMMITTED sieht ein `SELECT … FOR UPDATE` keine Teeversion, die ein gleichzeitiges PATCH nach Beginn der Abfrage committet hat. `mergeIngredients` wiederholt deshalb die Abfrage, bis kein aktueller Tee die Quelle mehr enthält (höchstens 10 Runden).
    - Der Test mit gleichzeitigem PATCH läuft über 3 Runden: Die Zusammenführung greift immer; die Änderung bleibt erhalten (200) oder wird mit 409 abgelehnt, nie still verloren.
    - Die Transaktion beim Zusammenführen von Zutaten hat 60 s Timeout statt der 5 s von Prisma.

- [ ] 10. API: Sperren, Login, Nutzerliste
  - Dateien: `server/api/admin/users/[id]/block.{post,delete}.ts`, `server/api/admin/moderation/users.get.ts`, `server/utils/users.ts` (`assertCanBlock`, `toModerationUser`), `server/utils/session.ts`, `server/api/auth/login.post.ts`, `test/api/block.test.ts`
  - Erfüllt: AK-0.2 (Routen), AK-6.1–AK-6.8, AK-8.1 (`USER_*`)
  - Prüfung (API-Tests):
    - Sperren → alle Sessions des Nutzers weg.
    - Login: mit richtigem Passwort 403 `ACCOUNT_BLOCKED` mit `until` (bzw. `null`), mit falschem 401 wie immer; kein Grund in der Antwort.
    - Abgelaufene Sperre → Login und Session ok; Entsperren sofort wirksam; erneutes Sperren ersetzt die Frist.
    - Rollenregeln: Moderator → Nutzer ok, → Moderator 403; Admin → Moderator ok; Admin nicht sperrbar; selbst 403.
    - Liste: Suche nach Anzeigename, `blocked=1`, `email` nur für Admins, `changes30d`.
    - Gast 401, Nutzer 403.

- [ ] 11. API: Massen-Zurücksetzen
  - Dateien: `server/api/admin/users/[id]/bulk-revert.{get,post}.ts`, `server/utils/moderation.ts` (`planBulkRevert`, `runBulkRevert`), Tests in `revert.test.ts`
  - Erfüllt: AK-0.2 (Routen), AK-7.1–AK-7.6, AK-8.1 (`BULK_REVERT`)
  - Prüfung (API-Tests):
    - Vorschau gleich Ergebnis.
    - Einträge auf den Stand vor der ersten Änderung im Zeitraum, mit `bulkRevertOfId`.
    - Übersprungen bei späterer Fremdänderung.
    - Im Zeitraum angelegte Einträge ausgeblendet; Tees vor Zutaten, damit eigene neue Tees nicht blockieren; Zutat in privatem Tee des Nutzers → `in_use`.
    - Private Tees unberührt; Duplikat beim Zurücksetzen → übersprungen.
    - Kein Rate-Limit (mehr als 30 Einträge); genau ein Audit-Eintrag mit Zählern.
    - Gast 401, Nutzer 403.

- [ ] 12. Rechte-Matrix
  - Dateien: `test/api/moderation.test.ts`
  - Erfüllt: AK-0.1 (API-Seite), AK-0.2
  - Prüfung: Für jede neue Route Gast 401, Nutzer 403 (bzw. 401 bei Nutzer-Routen für Gäste), Moderator und Admin erlaubt; `/api/admin/users`, `/api/admin/audit`, Rolle ändern und Passwort-Reset für Moderatoren weiter 403.

- [ ] 13. Zugang, Navigation, Texte
  - Dateien: `app/middleware/moderator.ts`, `app/composables/useAuth.ts` (`isModerator`), `app/composables/useOpenReports.ts`, `app/components/UserMenu.vue`, `app/components/AdminNav.vue`, `app/pages/admin/index.vue`, `i18n/locales/*.json`
  - Erfüllt: AK-0.1, AK-3.5, AK-9.4 (Texte)
  - Prüfung im Browser:
    - Moderator sieht „Moderation“ mit Badge, die Tabs Meldungen, Ausgeblendet und Nutzer sperren; `/admin/users` und `/admin/audit` leiten ihn auf die Startseite.
    - Admin sieht beides.
    - Nutzer sieht nichts davon; `/admin` leitet ihn um.
    - Unit-Test der Sprachdateien grün.

- [ ] 14. Seiten: Melden, Moderationsmenü, Banner, Weiterleitung
  - Dateien: `app/components/moderation/{ReportDialog,EntrySearch,EntryModerationMenu,HideDialog,HiddenBanner,MergeDialog}.vue`, `app/pages/ingredients/[id]/index.vue`, `app/pages/teas/[id]/index.vue`
  - Erfüllt: AK-2.1–AK-2.3, AK-2.6 (UI), AK-4.1, AK-4.2 (Weiterleitung), AK-4.5, AK-4.6, AK-5.1, AK-5.2 (Meldung), AK-5.5, AK-9.3
  - Prüfung im Browser:
    - Melden mit allen Gründen, Pflichtfelder, Duplikat-Suche, Snackbar, Doppelmeldung als Hinweis; Gast sieht Anmelde-Link.
    - Moderator: Zusammenführen mit Vorschau, Hinweis zu fehlenden Übersetzungen, Checkbox; danach Weiterleitung von der Quelle mit Hinweis.
    - Ausblenden mit Grund; `INGREDIENT_IN_USE` verständlich; Banner und Wiederherstellen.
    - 360 px, hell/dunkel.

- [ ] 15. Historie: Zurücksetzen und Ereignisse
  - Dateien: `app/components/catalog/{RevisionList,RevertDialog}.vue`, Historie-Seiten
  - Erfüllt: AK-1.1, AK-1.3, AK-1.5, AK-1.6 (UI), AK-4.2 (Historie der Quelle), AK-5.6
  - Prüfung im Browser:
    - Zurücksetzen mit und ohne Notiz → neue Version mit Chip „Zurückgesetzt auf Version n“ (de/en).
    - Konflikt mit zwei Tabs → Angebot zum Neuladen; Duplikat und ausgeblendete Zutat mit Link.
    - Gäste und Fremde bei privaten Tees sehen keinen Knopf.
    - Ereigniszeilen (Grund nur für Moderatoren); Kennzeichnungen für Zusammenführen und Massen-Zurücksetzung.
    - Historie einer zusammengeführten Quelle mit Hinweis, ohne Zurücksetzen.

- [ ] 16. Seiten: Meldungen, Ausgeblendet, Nutzer sperren
  - Dateien: `app/pages/admin/{reports,hidden}.vue`, `app/pages/admin/moderation/users.vue`, `app/components/moderation/{BlockDialog,BulkRevertDialog}.vue`, `app/pages/login.vue`, `app/pages/admin/audit.vue`
  - Erfüllt: AK-3.1–AK-3.3 (UI), AK-5.4, AK-6.1, AK-6.2 (UI), AK-6.6, AK-6.8, AK-7.1, AK-7.5 (UI), AK-8.2, AK-9.3
  - Prüfung im Browser:
    - Meldungen: Tabs, Filter, Aufklappen, Aktionen (Historie, Zusammenführen mit vorausgewähltem Ziel, Ausblenden, Autor sperren), Abschließen; Badge sinkt.
    - Ausgeblendet: Liste mit Link.
    - Nutzer sperren: Suche, Filter, Sperren/Ändern/Entsperren, Status-Texte inkl. „abgelaufen“; E-Mail nur als Admin.
    - Massen-Zurücksetzen: Vorschau, Bestätigung, Ergebnis mit Links.
    - Login eines Gesperrten zeigt Datum bzw. „dauerhaft“.
    - Audit zeigt alle neuen Ereignisse übersetzt, private Tees ohne Link.
    - 360 px, hell/dunkel, keine CSP-Verstöße.

- [ ] 17. Dokumentation
  - Dateien: `README.md` (Moderation, Rollen, SQL-Objekte `Report_open_key` und CHECK-Constraints, neue Fehlercodes), `.claude/skills/nuxt-dev/SKILL.md`, `.claude/specs/00-chore/README.md` (Beobachtung „Suche öffentlich ohne Rate-Limit“ mit 05 erneut prüfen und Ergebnis eintragen)
  - Erfüllt: Design („SQL-Objekte“)
  - Prüfung: README listet alle SQL-Objekte aus 0003, 0004 und 0006 und beschreibt Moderation und Rollen kurz. Der Skill nennt die Regel, inaktive Einträge nur über `ACTIVE` auszuschließen.

- [ ] 18. Abschluss
  - Erfüllt: alle AKs (Endabnahme)
  - Ablauf:
    1. `npm run lint`, `npm run typecheck`, `npm test` und `npm run build` laufen fehlerfrei.
    2. Production-Server (`.output`) starten. CSP-Durchlauf mit `securitypolicyviolation`-Listener über alle neuen Seiten und Dialoge (de/en).
    3. Jedes AK einzeln prüfen und als Tabelle (AK | Ergebnis | Nachweis) melden.
    4. Testdaten (`pw05`) aus der Dev-DB löschen.
    5. Status von `requirements.md`, `design.md` und `tasks.md` auf „umgesetzt“ setzen.
    6. Push nur nach Rücksprache.
