# Aufgaben: 04 – Tees

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23)**

Reihenfolge:
- gemeinsame Bausteine aus 03 herauslösen (ohne Verhaltensänderung) → Datenmodell → Regeln → Server-Bausteine → API → UI → Dokumentation → Endabnahme.
- Jede Aufgabe bringt ihre Tests mit.
- Nach jeder Aufgabe folgt ein Commit `feat(04-tees): <Aufgabe>` bzw. `refactor(04-tees): …` für die Herauslösungen.
- Gepusht wird nur nach Rücksprache.
- Zum Abschluss jeder Aufgabe laufen `npm run lint`, `npm run typecheck` und `npm test` grün.
- Browserprüfungen mit Testdaten unter der Kennung `pw04`, danach wieder aus der Dev-DB löschen.

- [x] 1. Gemeinsame Katalog-Bausteine herauslösen (Server und shared)
  - Dateien: `shared/utils/catalog.ts`, `shared/utils/ingredient.ts`, `shared/schemas/catalog.ts`, `shared/schemas/ingredient.ts`, `server/utils/catalog.ts` (`escapeLike`, `getUuidParam`, `assertCatalogRateLimit`, `lockName`), `server/utils/ingredients.ts`, Zutaten-Routen (Rate-Limit über den Helfer)
  - Erfüllt: Grundlage für AK-1.2, AK-2.4, AK-3.4, AK-10.1
  - Prüfung: Keine Verhaltensänderung. Alle bisherigen Unit- und API-Tests (207) bleiben unverändert grün; die bisherigen Exporte (`normalizeName`, `CONTENT_LOCALES`, `ingredientTextSchema` …) bleiben erhalten.
  - Ergebnis: 207 Tests grün, Lint und Typecheck grün. Abweichung: Gemeinsame Typen liegen in `shared/types/catalog.ts` (`CatalogText`, `CatalogFacts`, `RevisionEntry`, `SnapshotChange` …), `IngredientText` bleibt als Alias. Die Grenzwerte heißen jetzt `CATALOG_NAME_MAX` usw., weil Re-Exporte aus `shared/utils/` von Nuxts Auto-Import doppelt gemeldet würden. Deshalb änderten sich in `test/unit/ingredient.test.ts` nur die Import-Zeilen, die Tests selbst nicht. Die Schemas aus `#shared/schemas/ingredient` bleiben erhalten.

- [x] 2. UI-Bausteine aus IngredientForm herauslösen
  - Dateien: `app/components/catalog/TranslationFields.vue`, `app/components/catalog/BrewFields.vue`, `app/components/ingredient/IngredientForm.vue`
  - Erfüllt: Grundlage für AK-5.1, AK-10.1
  - Prüfung im Browser: Anlegen und Bearbeiten von Zutaten verhalten sich wie vorher (Tabs, „+“, Feldfehler, Min:Sek, ähnliche Zutaten, Konflikt). Dabei wird auch `<v-row dense>` durch `density="compact"` ersetzt (00-chore/09), keine „[Vuetify UPGRADE]“-Warnung.
  - Ergebnis: Die Playwright-Durchläufe aus 03 (Anlegen, Feldfehler de/en, Duplikat, Tabs mit „Original“/„+“, `?lang=en`, Konflikt, „Keine Änderungen“, Historie, Audit, 360 px) liefern dieselben Ergebnisse wie vorher; keine „[Vuetify UPGRADE]“-Warnung mehr. Die Texte der Bausteine liegen jetzt unter `catalog.*` (`fields`, `caffeineOptions`, `tabs`) statt unter `ingredients.*`.

- [x] 3. Datenmodell und Migration
  - Dateien: `prisma/schema.prisma`, `prisma/migrations/0004_teas/` (per `--create-only`, ergänzt um `TeaVersion_current_key`), `shared/utils/roles.ts`, `shared/types/auth.ts` (4 Audit-Ereignisse), `i18n/locales/*.json` (Audit-Texte)
  - Erfüllt: AK-0.1, AK-0.2, AK-9.1 (Grundlage)
  - Prüfung:
    - `npm run db:migrate` auf Dev und `tea_test`.
    - `prisma migrate diff` gegen die DB ist leer; `migrate dev` meldet „Already in sync“.
    - Partieller Index und GIN-Index vorhanden; die Indizes aus 0003 sind unangetastet.
    - Bestehende Tests grün.
  - Ergebnis: Die Migration enthält kein `DROP`. Beide DBs haben `TeaVersion_current_key` und `TeaVersionTranslation_name_trgm`, die Indizes aus 0003 sind unverändert. `migrate diff` ist leer, `migrate dev` meldet „Already in sync“. 207 Tests grün. `nameKey` ist `TEXT` (Lehre aus 00-chore/04).

- [x] 4. Typen, Regeln und Schemas für Tees
  - Dateien: `shared/types/tea.ts`, `shared/utils/tea.ts` (`diffTeaSnapshots`, Rest-Berechnung), `shared/schemas/tea.ts`, `app/composables/useFormErrors.ts` (Listenfehler `duplicateIngredient`, `percentSum`), `test/unit/tea.test.ts`
  - Erfüllt: AK-0.1, AK-0.3, AK-2.5 (Regel), AK-4.3 (Regel), AK-6.1 (Regel), AK-10.1
  - Prüfung (Unit-Tests):
    - Grenzen 0/1/20/21 Zutaten, Anteil 0/1/100/101, Summe 100/101, doppelte Zutat.
    - Marke wird nur bei `bought` behalten.
    - `updateTeaSchema` lehnt `visibility` ab.
    - `diffTeaSnapshots`: hinzugefügt, entfernt, verschoben, Anteil, Art, Marke, Sichtbarkeit, keine Änderung.
    - Rest = 100 − Summe.
  - Ergebnis: 30 Unit-Tests grün (Unit gesamt 156). Listenfehler kommen als Schlüssel (`duplicateIngredient`, `percentSum`) am Pfad `ingredients`; `useFormErrors` übersetzt `custom`-Meldungen über `validation.*` und meldet zu lange Listen als „Höchstens n“. API-Tests unberührt (die Schemas nutzt der Server erst ab Aufgabe 6).

- [x] 5. Server-Bausteine für Tees
  - Dateien: `server/utils/teas.ts` (`visibleTo`, `loadTea`, Snapshot/Detail, `writeTeaVersion`, `assertTeaNameAvailable`, `listTeas`, `findSimilarTeas`), `server/utils/ingredients.ts` (`loadIngredientViews`)
  - Erfüllt: AK-1.7, AK-2.4 (Bausteine)
  - Prüfung: Typecheck; die Abfragen prüfen die API-Tests ab Aufgabe 6.
  - Ergebnis: Lint und Typecheck grün. Die Tee-Funktionen tragen eindeutige Namen (`loadCurrentTea`, `writeTeaVersion` …), weil `server/utils` per Auto-Import global ist. `toRevisionEntry` ist strukturell typisiert und dient beiden. Dazu kommen `assertIngredientsExist`, `assertTeaNamesAvailable` (alle Sprachen in fester Reihenfolge, optional nur geänderte) und `canViewTea` als einzige Sichtbarkeitsregel.

- [x] 6. API: Anlegen, Detail, ähnliche Tees
  - Dateien: `server/api/teas/index.post.ts`, `server/api/teas/[id]/index.get.ts`, `server/api/teas/similar.get.ts`, `test/api/teas.test.ts`
  - Erfüllt: AK-1.5, AK-1.6, AK-1.7 (Detail), AK-2.1, AK-2.3–AK-2.6, AK-9.1 (Anlegen), AK-10.2
  - Prüfung (API-Tests):
    - Gast 401 beim Anlegen.
    - Privat (Standard) und öffentlich → Version 1, Ersteller, Audit `TEA_CREATED` mit `private`.
    - Unbekannte Zutat → 400 `INGREDIENT_NOT_FOUND`.
    - Duplikat öffentlich (Name + Marke, andere Schreibweise) → 409 mit ID; andere Marke ok; privat ok; 5 gleichzeitige → eine 201.
    - Detail mit Zutatennamen, Reihenfolge, `ingredientsCaffeinated`, Ersteller ohne E-Mail.
    - Fremder privater Tee → 404, auch für Admin.
    - `similar` nur öffentlich.
    - 80 × „İ“ als Name speicherbar.
    - `<script>` als Text.
  - Ergebnis: 13 API-Tests grün. Testzutaten werden per SQL angelegt, damit das Rate-Limit nicht greift; das Rate-Limit selbst prüft Aufgabe 8.

- [x] 7. API: Liste, Suche, Zutatenfilter, Meine
  - Dateien: `server/api/teas/index.get.ts`, `test/api/teas.test.ts`
  - Erfüllt: AK-1.1–AK-1.4, AK-7.1, AK-8.1 (API)
  - Prüfung (API-Tests):
    - Nur öffentliche Tees, auch für den Ersteller.
    - Sortierung mit Umlauten, 24/Seite.
    - Suche über Namen aller Sprachen und Marke.
    - Zutatenfilter ohne fremd-private.
    - Fallback-Flag.
    - `mine=1` zeigt eigene private und öffentliche; Gast → 401.
    - Namen und Zutaten alter Versionen werden nicht gefunden.
  - Ergebnis: 8 API-Tests grün (21 in der Datei). Sortierung „apfel, Äpfel, Birne, Zimt“; private Tees fehlen in „Alle“, auch für den Ersteller; Suche über die englische Übersetzung und die Marke; Zutatenfilter ohne fremd-private und ohne alte Versionen; „Meine“ mit Sichtbarkeit; Gast mit `mine` → 401.

- [ ] 8. API: Bearbeiten und Übersetzen
  - Dateien: `server/api/teas/[id]/index.patch.ts`, `test/api/teas.test.ts`
  - Erfüllt: AK-3.1–AK-3.4, AK-5.1, AK-9.1 (Bearbeiten)
  - Prüfung (API-Tests):
    - Dritte bearbeiten öffentliche Tees → Version 2 mit Autor; Ersteller bleibt.
    - Zutatenliste ersetzen und umsortieren.
    - Keine Änderung → keine Version.
    - Veraltete Version → `EDIT_CONFLICT`.
    - Umbenennen/Marke ändern in Duplikat → 409.
    - Fremder privater Tee → 404.
    - `visibility` im Body → 400.
    - Übersetzung hinzufügen.
    - Genau eine aktuelle Version (SQL).
    - Rate-Limit gemeinsam mit Zutaten (Anlegen von Zutaten und Tees gemischt, 31. → 429).

- [ ] 9. API: Veröffentlichen und Löschen
  - Dateien: `server/api/teas/[id]/publish.post.ts`, `server/api/teas/[id]/index.delete.ts`, `test/api/teas.test.ts`
  - Erfüllt: AK-3.5, AK-3.6, AK-4.1–AK-4.4, AK-9.1
  - Prüfung (API-Tests):
    - Veröffentlichen → neue Version `public` mit Notiz „veröffentlicht“, Audit; erscheint in der Liste.
    - Zweites Mal → 400 `ALREADY_PUBLIC`.
    - Duplikat beim Veröffentlichen → 409.
    - Nicht-Ersteller → 404.
    - Veraltete Version → `EDIT_CONFLICT`.
    - Löschen privat → 204, Versionen weg, Audit `TEA_DELETED`.
    - Löschen öffentlich → 409 `TEA_PUBLIC`.
    - Fremder Tee → 404.

- [ ] 10. API: Historie und Vergleich
  - Dateien: `server/api/teas/[id]/revisions.get.ts`, `server/api/teas/[id]/compare.get.ts`, `test/api/teas.test.ts`
  - Erfüllt: AK-6.1, AK-6.2
  - Prüfung (API-Tests):
    - Versionen neueste zuerst.
    - Vergleich mit Zutaten hinzugefügt/entfernt/verschoben/Anteil, Sichtbarkeit, Marke, inkl. Zutatennamen.
    - Fremd-privat → 404.
    - Keine Änderungsrouten auf `/revisions`.

- [ ] 11. Sichtbarkeits-Matrix
  - Dateien: `test/api/teas.test.ts`
  - Erfüllt: AK-1.7, AK-3.2, AK-4.4, AK-6.2, AK-10.4
  - Prüfung: Ein Test spielt einen privaten Tee von Nutzer A gegen Gast, Nutzer B, Moderator und Admin über **alle** Routen durch:
    - Detail, PATCH, Publish, DELETE, Revisions und Compare → 404;
    - Liste, Suche, `similar`, Zutatenfilter und `mine` → nicht enthalten.
    - Für A selbst funktioniert alles.

- [ ] 12. Sprachpfade, Navigation, Texte
  - Dateien: `nuxt.config.ts` (`i18n.pages`), `app/components/AppNav.vue`, `i18n/locales/*.json`
  - Erfüllt: AK-10.3 (Navigation, Texte)
  - Prüfung im Browser: `/tees` und `/en/teas` erreichbar; Sprachumschalter; „Tees“ in App-Bar und Drawer (360 px); bestehende Seiten unverändert.

- [ ] 13. Seiten: Liste und Detail
  - Dateien: `app/pages/teas/index.vue`, `app/pages/teas/[id]/index.vue`, `app/components/tea/TeaIngredientsList.vue`
  - Erfüllt: AK-1.1–AK-1.7 (UI), AK-2.6 (UI), AK-3.6, AK-4.1 (UI), AK-7.1 (UI), AK-10.2, AK-10.3
  - Prüfung im Browser, auf Deutsch und Englisch:
    - Tabs Alle/Meine; Suche und Filter-Chip in der URL.
    - Detail mit Zutaten, Anteilen, „Rest unbekannt“ und Koffein-Hinweis.
    - Fallback-Hinweis.
    - Veröffentlichen und Löschen mit Dialog, nur für den Ersteller eines privaten Tees.
    - Fremder privater Tee → 404-Seite.
    - `<b>` wörtlich.
    - 360 px ohne Überlauf.

- [ ] 14. Formular: Anlegen und Bearbeiten
  - Dateien: `app/components/tea/TeaIngredientsField.vue`, `app/components/tea/TeaForm.vue`, `app/utils/teaForm.ts`, `app/pages/teas/new.vue`, `app/pages/teas/[id]/edit.vue`, `app/pages/ingredients/new.vue` (`?return=`)
  - Erfüllt: AK-2.1–AK-2.5 (UI), AK-3.1, AK-3.3 (UI), AK-5.1 (UI), AK-10.1
  - Prüfung im Browser, auf Deutsch und Englisch:
    - Zutaten suchen, hinzufügen, hoch/runter, entfernen; Anteile mit Summe und Rest.
    - Über 100 % und doppelte Zutat → Feldfehler.
    - Marke nur bei „gekauft“.
    - Ähnliche Tees nur bei „öffentlich“.
    - Duplikat mit Link.
    - „Zutat fehlt“ → Zutat anlegen → zurück, Entwurf vollständig und neue Zutat angehängt.
    - Bearbeiten mit Tabs, Konflikt mit zwei Tabs, „Keine Änderungen“.
    - Gast → Login.
    - 360 px ohne Überlauf, Tastaturbedienung der Hoch/Runter-Buttons.

- [ ] 15. Historie, Zutatenseite, Audit-Anzeige
  - Dateien: `app/pages/teas/[id]/history.vue`, `app/components/tea/TeaRevisionDiff.vue`, `app/pages/ingredients/[id]/index.vue` („Enthalten in“), `app/pages/admin/audit.vue`
  - Erfüllt: AK-6.1 (UI), AK-8.1, AK-9.1 (UI)
  - Prüfung im Browser:
    - Historie mit Zutaten-Diff („+ Minze 20 %“, „Grüntee 60 % → 70 %“, Position), Standardvergleich, 360 px gestapelt.
    - Zutatenseite zeigt bis 10 öffentliche Tees und „alle anzeigen“ → gefilterte Liste; private erscheinen nicht.
    - Audit-Zeilen für alle vier Ereignisse, Link nur bei öffentlichen Tees.

- [ ] 16. Dokumentation
  - Dateien: `README.md` (Tees, SQL-Objekt `TeaVersion_current_key`, neue Fehlercodes), `.claude/skills/nuxt-dev/SKILL.md`
  - Erfüllt: Design („SQL-Objekte“)
  - Prüfung: README listet alle SQL-Objekte aus 0003 und 0004 und beschreibt Tees und Sichtbarkeit kurz.

- [ ] 17. Abschluss
  - Erfüllt: alle AKs (Endabnahme)
  - Ablauf:
    1. `npm run lint`, `npm run typecheck`, `npm test` und `npm run build` laufen fehlerfrei.
    2. Production-Server mit `NODE_ENV=production` (bis 00-chore/01 behoben ist) starten und Cookie, CSP und Seiten prüfen. Den CSP-Durchlauf mit `securitypolicyviolation`-Listener machen; der zod-Eval (00-chore/08) ist bekannt und wird getrennt ausgewiesen.
    3. Jedes AK einzeln prüfen und als Tabelle (AK | Ergebnis | Nachweis) melden.
    4. Testdaten aus der Dev-DB löschen.
    5. Status von `requirements.md`, `design.md` und `tasks.md` auf „umgesetzt“ setzen.
    6. Push nur nach Rücksprache.
