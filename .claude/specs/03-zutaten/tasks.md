# Aufgaben: 03 – Zutaten

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-23)**

Reihenfolge:
- Datenmodell → gemeinsame Regeln → Server-Bausteine → API → UI → Dokumentation → Endabnahme.
- Jede Aufgabe bringt ihre Tests mit.
- Nach jeder Aufgabe folgt ein Commit `feat(03-zutaten): <Aufgabe>`.
- Gepusht wird nur nach Rücksprache.
- Zum Abschluss jeder Aufgabe laufen `npm run lint`, `npm run typecheck` und `npm test` grün.

- [x] 1. Datenmodell und Migration
  - Dateien: `prisma/schema.prisma` (`Caffeine`, `Ingredient`, `IngredientVersion`, `IngredientVersionTranslation`, `AuditEvent` + 2 Werte, Relation an `User`), `prisma/migrations/0003_ingredients/` (per `--create-only`, ergänzt um `pg_trgm`, partiellen Unique-Index und GIN-Index), `test/setup/global-api.ts` (neue Tabellen leeren)
  - Erfüllt: AK-0.1, AK-0.2, AK-3.6 (Grundlage)
  - Prüfung:
    - `npm run db:migrate` läuft auf der Dev-DB und auf `tea_test`.
    - `\d "IngredientVersion"` zeigt `IngredientVersion_current_key` mit `WHERE "isCurrent"`, `\d "IngredientVersionTranslation"` den Trigram-Index.
    - `prisma migrate diff` von der Migration zum Schema schlägt kein Löschen der beiden Indizes vor, oder das Ergebnis wird im Design vermerkt.
    - Die API-Tests aus 01 und 02 bleiben grün.
  - Ergebnis: Beide DBs haben die Indizes, `de-x-icu` ist vorhanden. Prisma wollte nur den GIN-Index löschen; er steht jetzt auch im Schema (`type: Gin`), der Diff ist leer (siehe Design). `global-api.ts` leert bereits alle Tabellen und blieb unverändert. Die Audit-Ereignisse in `shared/` und ihre Texte sind vorgezogen, weil Typecheck und Enum-Test sie brauchen. 124 Tests grün.

- [x] 2. Gemeinsame Typen, Regeln und Schemas
  - Dateien: `shared/types/ingredient.ts`, `shared/utils/ingredient.ts` (`CONTENT_LOCALES`, `normalizeName`, `pickTranslation`, `diffSnapshots`), `shared/schemas/ingredient.ts`, `shared/utils/roles.ts`, `shared/types/auth.ts` (Audit-Ereignisse), `test/unit/ingredient.test.ts`
  - Erfüllt: AK-1.3 (Regel), AK-2.3 (Normalisierung), AK-3.3 (Regel), AK-4.3, AK-5.2 (Regel), AK-7.1
  - Prüfung (Unit-Tests):
    - `normalizeName`: Leerraum am Rand und doppelt, Groß/klein, Umlaute, NFC/NFD gleich.
    - `diffSnapshots`: Grundfeld geändert, Übersetzung neu (`from: null`) bzw. geändert, keine Änderung → leer.
    - `pickTranslation`: aktuelle Sprache vorhanden bzw. Fallback auf Originalsprache mit `translated: false`.
    - Schemas: Grenzen Name 1/2/80/81, Beschreibung 2000/2001, Temperatur 39/40/100/101, Ziehzeit 9/10/1800/1801, unbekannte Sprache; leere Beschreibung → `null`.
  - Ergebnis: 39 Unit-Tests grün. Die Audit-Ereignisse kamen schon mit Aufgabe 1. `pageSchema` aus `shared/schemas/auth.ts` wird jetzt exportiert und mitbenutzt; dazu `revisionsQuerySchema` und die Grenzwerte als Konstanten in `shared/utils/ingredient.ts`. Leere Notizen werden wie leere Beschreibungen zu `null`.

- [x] 3. Server-Bausteine
  - Dateien: `server/utils/ingredients.ts` (`CURRENT`-Filter, Laden als Snapshot/Detail, Version schreiben, `assertNameAvailable` mit Advisory-Sperre, `escapeLike`), `test/unit/ingredient.test.ts` (`escapeLike`)
  - Erfüllt: AK-1.2 (Baustein), AK-2.3, AK-3.4 (Baustein)
  - Prüfung: Unit-Test für `escapeLike` (`%`, `_`, `\`). Die Abfragen prüfen die API-Tests ab Aufgabe 4.
  - Ergebnis: Unit-Test grün. Die SQL-Abfragen für Liste und ähnliche Namen (`listIngredients`, `findSimilar`) liegen mit in `server/utils/ingredients.ts`. Ähnlichkeit nutzt den Operator `%` (Schwelle 0,3 wie im Design) statt `similarity() > 0.3`, damit der GIN-Index greift.

- [x] 4. API: Anlegen, Detail, ähnliche Namen
  - Dateien: `server/api/ingredients/index.post.ts`, `server/api/ingredients/[id]/index.get.ts`, `server/api/ingredients/similar.get.ts`, `test/api/ingredients.test.ts`
  - Erfüllt: AK-1.4 (API), AK-1.5 (API), AK-2.1–AK-2.4 (API), AK-3.5 (Anlegen), AK-6.1 (Anlegen), AK-7.2 (API)
  - Prüfung (API-Tests):
    - Gast → 401 bei POST, GET öffentlich.
    - Anlegen → 201, Version 1 mit Autor, Audit `INGREDIENT_CREATED` mit ID und Version.
    - Duplikat mit anderer Schreibweise und Leerzeichen → 409 `DUPLICATE_NAME` mit ID der bestehenden Zutat; gleicher Name in anderer Sprache ist erlaubt.
    - 5 gleichzeitige Anlegen-Anfragen mit demselben Namen → genau eine 201, vier 409.
    - Detail: unbekannte UUID → 404, ungültige ID → 404; `updatedBy` ohne E-Mail.
    - Ähnliche Namen: Tippfehler („Pfeferminze“) findet „Pfefferminze“, höchstens 5 Treffer.
    - `<script>` im Namen kommt unverändert als Text zurück.
  - Ergebnis: 9 API-Tests grün, Suite 177 Tests. Zusätzlich geprüft: Feldfehler für Name und Temperatur (AK-7.1). Der Audit-Eintrag hat keinen `targetId`, weil dieser auf `User` verweist; die Zutat steht in `details`.

- [ ] 5. API: Liste und Suche
  - Dateien: `server/api/ingredients/index.get.ts`, `test/api/ingredients.test.ts`
  - Erfüllt: AK-1.1 (API), AK-1.2, AK-1.3 (API)
  - Prüfung (API-Tests):
    - Sortierung mit Umlauten („Äpfel“ vor „Birne“), 24 pro Seite, zweite Seite.
    - Suche findet über die englische Übersetzung auch bei `locale=de`; `%` und `_` im Suchbegriff werden wörtlich gesucht.
    - Ohne Übersetzung: Name in Originalsprache und `translated: false`.
    - Namen alter Versionen werden nicht gefunden.

- [ ] 6. API: Bearbeiten und Übersetzen
  - Dateien: `server/api/ingredients/[id]/index.patch.ts`, `test/api/ingredients.test.ts`
  - Erfüllt: AK-3.1–AK-3.5, AK-4.1, AK-4.2, AK-6.1 (Bearbeiten)
  - Prüfung (API-Tests):
    - Bearbeiten → Version 2 mit Autor und Notiz, Audit `INGREDIENT_UPDATED` mit `locales`.
    - Ohne Änderung → `changed: false`, keine neue Version, kein Audit.
    - Veraltete Version → 409 `EDIT_CONFLICT` mit `currentVersion`.
    - Umbenennen in bestehenden Namen → 409 `DUPLICATE_NAME`; Umbenennen der eigenen Schreibweise („pfefferminze“ → „Pfefferminze“) ist erlaubt.
    - Übersetzung hinzufügen → sofort in der Liste mit `translated: true`; unveränderte Übersetzungen sind in der neuen Version kopiert.
    - Nach mehreren Änderungen hat jede Zutat genau eine Version mit `isCurrent` (per SQL).
    - 31. Änderung in 10 Minuten (Anlegen und Bearbeiten gemischt) → 429 mit `Retry-After`.

- [ ] 7. API: Historie und Vergleich
  - Dateien: `server/api/ingredients/[id]/revisions.get.ts`, `server/api/ingredients/[id]/compare.get.ts`, `test/api/ingredients.test.ts`
  - Erfüllt: AK-5.1–AK-5.3
  - Prüfung (API-Tests):
    - Versionen neueste zuerst mit Nummer, Zeit, Autor (Anzeigename) und Notiz; `isCurrent` nur an der neuesten.
    - Vergleich 1 → 3 listet alle geänderten Felder, eine neue Sprache mit `from: null`.
    - Unbekannte Version → 404, `from`/`to` keine Zahl → 400.
    - `PATCH`/`DELETE` auf `/revisions` und `DELETE` auf die Zutat → 404 bzw. 405.

- [ ] 8. Sprachpfade und Navigation
  - Dateien: `nuxt.config.ts` (`i18n.customRoutes`, `i18n.pages`), `app/components/AppNav.vue`, `app/layouts/default.vue`, `i18n/locales/*.json`
  - Erfüllt: AK-1.1 (Pfade), AK-7.3 (Navigation)
  - Prüfung im Browser:
    - `/zutaten` und `/en/ingredients` erreichbar (zunächst mit Platzhalterseite); der Sprachumschalter wechselt zwischen beiden.
    - Ab `sm` steht „Zutaten“ in der App-Bar, bei 360 px öffnet das Menü-Icon den Drawer.
    - Bestehende Seiten (Login, Admin) funktionieren weiter.

- [ ] 9. Seiten: Liste und Detail
  - Dateien: `app/pages/ingredients/index.vue`, `app/pages/ingredients/[id]/index.vue`, `app/components/ingredient/IngredientFacts.vue`, `app/composables/useIngredientText.ts`, `i18n/locales/*.json`
  - Erfüllt: AK-1.1–AK-1.5 (UI), AK-2.4 (UI), AK-7.2, AK-7.3
  - Prüfung im Browser, auf Deutsch und Englisch:
    - Suche mit Verzögerung, `?q` und `?page` in der URL, Neuladen behält beides.
    - „nicht übersetzt“-Hinweis bei fehlender Übersetzung.
    - Gast sieht Anmelde-Hinweis statt „Zutat anlegen“.
    - Detail: Beschreibung mit `<b>` erscheint wörtlich, Zeilenumbrüche bleiben; „Zuletzt geändert … von …“.
    - Unbekannte ID → Nuxt-Fehlerseite 404.
    - 360 px ohne horizontales Scrollen, keine CSP-Verstöße.

- [ ] 10. Seiten: Anlegen und Bearbeiten
  - Dateien: `app/components/ingredient/IngredientForm.vue`, `app/pages/ingredients/new.vue`, `app/pages/ingredients/[id]/edit.vue`, `i18n/locales/*.json`
  - Erfüllt: AK-2.1–AK-2.3 (UI), AK-3.1–AK-3.4 (UI), AK-4.1, AK-4.2 (UI), AK-7.1, AK-7.3
  - Prüfung im Browser, auf Deutsch und Englisch:
    - Anlegen → Detailseite; „Ähnliche Zutaten“ erscheinen beim Tippen.
    - Duplikat → Meldung mit Link zur bestehenden Zutat.
    - Zu kurzer Name, Temperatur außerhalb → übersetzte Feldmeldung.
    - Bearbeiten: Tabs pro Sprache, Originalsprache markiert, „+“ bei fehlender Übersetzung, `?lang=en` öffnet den Tab.
    - Konflikt mit zwei Tabs → Hinweis und „Aktuelle Fassung laden“ (mit Rückfrage).
    - Speichern ohne Änderung → „Keine Änderungen“.
    - Ziehzeit wird als Minuten:Sekunden angezeigt und korrekt gespeichert.
    - Gast auf `/zutaten/neu` bzw. `/bearbeiten` landet auf `/login`.
    - 360 px ohne horizontales Scrollen, keine CSP-Verstöße.

- [ ] 11. Seiten: Historie und Vergleich, Audit-Anzeige
  - Dateien: `app/pages/ingredients/[id]/history.vue`, `app/components/ingredient/RevisionDiff.vue`, `app/pages/admin/audit.vue`, `i18n/locales/*.json`
  - Erfüllt: AK-5.1, AK-5.2 (UI), AK-6.1 (UI), AK-7.3
  - Prüfung im Browser:
    - Versionsliste, Standardvergleich neueste gegen vorletzte, Auswahl „von“/„bis“ ändert die Tabelle.
    - Bei 360 px werden die Vergleichszeilen gestapelt.
    - Audit-Seite zeigt bei Zutat-Ereignissen „Version n“ und einen Link zur Zutat.

- [ ] 12. Dokumentation
  - Dateien: `README.md` (Migrationen mit `--create-only`, SQL-Indizes), `.claude/skills/nuxt-dev/SKILL.md` (dasselbe als Hinweis)
  - Erfüllt: Haken aus dem Design (Indizes außerhalb von Prisma)
  - Prüfung: README und Skill erklären, warum neue Migrationen vor dem Anwenden geprüft werden und welche Indizes erhalten bleiben müssen.

- [ ] 13. Abschluss
  - Erfüllt: alle AKs (Endabnahme)
  - Ablauf:
    1. `npm run lint`, `npm run typecheck`, `npm test` und `npm run build` laufen fehlerfrei.
    2. Im Browser gibt es keine CSP-Verstöße, weder im Dev noch in Production, über alle neuen Seiten.
    3. Jedes AK einzeln prüfen und als Tabelle (AK | Ergebnis | Nachweis) melden.
    4. Status von `requirements.md`, `design.md` und `tasks.md` auf „umgesetzt“ setzen.
    5. Push nur nach Rücksprache.
