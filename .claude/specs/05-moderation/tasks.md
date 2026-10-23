# Aufgaben: 05 – Moderation

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23), in Umsetzung**

Reihenfolge:
- Herauslösungen ohne Verhaltensänderung → Datenmodell → Regeln → Server-Bausteine → API → UI → Dokumentation → Endabnahme.
- Jede Aufgabe bringt ihre Tests mit.
- Nach jeder Aufgabe folgt ein Commit `feat(05-moderation): <Aufgabe>` bzw. `refactor(05-moderation): …` für die Herauslösungen.
- Gepusht wird nur nach Rücksprache.
- Zum Abschluss jeder Aufgabe laufen `npm run lint`, `npm run typecheck` und `npm test` grün.
- Browserprüfungen mit Testdaten unter der Kennung `pw05`, danach wieder aus der Dev-DB löschen.

- [ ] 1. `save*Version` aus den PATCH-Routen herauslösen
  - Dateien: `server/utils/ingredients.ts` (`saveIngredientVersion`), `server/utils/teas.ts` (`saveTeaVersion`), `server/api/ingredients/[id]/index.patch.ts`, `server/api/teas/[id]/index.patch.ts`
  - Erfüllt: Grundlage für AK-1.3, AK-4.3, AK-7.2
  - Prüfung: Keine Verhaltensänderung. Diff, optimistisches Sperren, Duplikatregel und P2002 → `EDIT_CONFLICT` sitzen in der Funktion; die PATCH-Routen behalten Rechte, Rate-Limit und Audit. Alle bisherigen Tests bleiben unverändert grün.

- [ ] 2. `RevisionList` aus den Historie-Seiten herauslösen
  - Dateien: `app/components/catalog/RevisionList.vue`, `app/pages/ingredients/[id]/history.vue`, `app/pages/teas/[id]/history.vue`
  - Erfüllt: Grundlage für AK-1.1, AK-5.6
  - Prüfung im Browser: Beide Historien verhalten sich wie vorher (Radio-Auswahl, Vergleich, Seiten, 360 px); keine Konsolenwarnungen.

- [ ] 3. Datenmodell und Migration
  - Dateien: `prisma/schema.prisma`, `prisma/migrations/0006_moderation/` (per `--create-only`, ergänzt um `Report_open_key` und die beiden CHECK-Constraints), `shared/utils/roles.ts`, `shared/types/auth.ts` (13 Audit-Ereignisse), `i18n/locales/*.json` (Audit-Texte)
  - Erfüllt: Grundlage für alle AKs, AK-8.1 (Ereignistypen)
  - Prüfung:
    - `npm run db:migrate` auf Dev und `tea_test`.
    - `prisma migrate diff` gegen die DB ist leer; `migrate dev` meldet „Already in sync“.
    - Die Migration enthält kein `DROP`. Partieller Index und CHECK-Constraints sind vorhanden, die Indizes aus 0003/0004 unangetastet.
    - Bestehende Tests grün.

- [ ] 4. Typen, Regeln und Schemas
  - Dateien: `shared/types/moderation.ts`, `shared/types/catalog.ts` (`RevisionEntry`-Felder, `ModerationState`), `shared/utils/moderation.ts` (`BLOCK_DURATIONS`, `blockedUntil`, `isBlocked`, `combineIngredients`), `shared/schemas/moderation.ts`, `shared/schemas/catalog.ts` (`revertSchema`), `app/composables/useFormErrors.ts` (falls neue Codes nötig), `test/unit/moderation.test.ts`
  - Erfüllt: AK-2.1, AK-2.2 (Regel), AK-4.3 (Regel), AK-6.1, AK-6.3 (Regel), AK-9.1
  - Prüfung (Unit-Tests):
    - `reportSchema`: Kommentar Pflicht bei `other`, Original Pflicht bei `duplicate` und verworfen bei anderen Gründen, 500/501 Zeichen.
    - `blockSchema`, `hideSchema` (leerer Grund → Fehler), `revertSchema`.
    - `blockedUntil` für alle Dauern; `isBlocked` (nie gesperrt, unbefristet, läuft noch, abgelaufen).
    - `combineIngredients`: nur Quelle, beide mit beiden/einem/keinem Anteil, Position des Ziels bleibt, Reihenfolge der übrigen.

- [ ] 5. Zustand „aktiv“ in allen bestehenden Abfragen
  - Dateien: `server/utils/ingredients.ts`, `server/utils/teas.ts` (`ACTIVE`, `activeSql`; Liste, Suche, `similar`, Detail, Duplikatregel, „Enthalten in“; `assertIngredientsExist` nur aktive, mit `FOR SHARE`), `server/utils/catalog.ts` (`CatalogType`, `assertEntryActive`, `lockEntry`, `recordCatalogEvent`), `server/api/{ingredients,teas}/[id]/{index.get,revisions.get,compare.get,index.patch}.ts`
  - Erfüllt: AK-4.2, AK-5.1, AK-5.3 (Abfragen), AK-5.4 (Detail für Moderatoren)
  - Prüfung (API-Tests, Zustand per Prisma in der Test-DB gesetzt):
    - Ausgeblendet: Detail, Historie, Vergleich und PATCH → 404 für Gast und Nutzer; Detail für Moderatoren 200 mit `moderation`.
    - Weder in Liste, Suche, `similar`, Zutatenfilter noch in „Enthalten in“.
    - Name wieder frei.
    - Zusammengeführt: Detail 404 mit `mergedInto`, mit `?merged=1` 200; Historie lesbar.
    - Tee speichern mit ausgeblendeter Zutat → 400 `INGREDIENT_NOT_FOUND`.
    - Bestehende Tests grün.

- [ ] 6. API: Zurücksetzen
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

- [ ] 7. API: Melden und Meldungen
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

- [ ] 8. API: Ausblenden und Wiederherstellen
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

- [ ] 9. API: Zusammenführen
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
