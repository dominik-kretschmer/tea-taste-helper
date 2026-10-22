# Aufgaben: 02 – Auth & Rollen

> Phase 3 zu [design.md](design.md). Status: **freigegeben (2026-10-22)**

Reihenfolge:
- Sicherheitsrahmen → Datenmodell → Server-Bausteine → API → UI → Endabnahme.
- Jede Aufgabe bringt ihre Tests mit.
- Nach jeder Aufgabe folgt ein Commit `feat(02-auth-rollen): <Aufgabe>`.
- Gepusht wird nur nach Rücksprache.
- Zum Abschluss jeder Aufgabe laufen `npm run lint`, `npm run typecheck` und `npm test` grün.

- [ ] 1. Sicherheitsrahmen: nuxt-security, CSRF, Konfiguration
  - Dateien: `package.json` (`nuxt-security`, `nuxt-csurf`, `@node-rs/argon2`), `nuxt.config.ts` (`security`), `server/utils/env.ts` (`ADMIN_EMAIL`, `TRUST_PROXY`, `CSRF_SECRET`), `.env.example`, `.env`, `server/utils/errors.ts` (`CSRF_INVALID`, `RATE_LIMITED`), `test/unit/env.test.ts`, `test/unit/errors.test.ts`
  - Erfüllt: AK-9.1, AK-10.1 (Grundlage)
  - Prüfung:
    - Lint, Typecheck und `npm run build` sind fehlerfrei.
    - `curl -I` auf `/` zeigt CSP mit Nonce, `nosniff`, `Referrer-Policy` und `X-Frame-Options`.
    - `POST /api/gibt-es-nicht` ohne Token → 403 `CSRF_INVALID`.
    - `<meta name="csrf-token">` steht im HTML.
    - Im Browser gibt es auf der Startseite keine CSP-Verstöße, und der Sprachumschalter funktioniert.
    - Test, ob `style-src` ohne `'unsafe-inline'` auskommt; das Ergebnis wird im Design vermerkt.

- [ ] 2. Datenmodell und Migration
  - Dateien: `prisma/schema.prisma`, `prisma/migrations/0002_auth/`, `test/setup/global-api.ts` (Tabellen vor dem Lauf leeren)
  - Erfüllt: Grundlage für AK-1–AK-11
  - Prüfung: `npm run db:migrate` legt `User`, `Session` und `AuditLog` samt Enums und Indizes an. Die Migration läuft auch auf `tea_test`. Die API-Tests aus 01 bleiben grün.

- [ ] 3. Gemeinsame Typen und Schemas
  - Dateien: `shared/types/auth.ts`, `shared/schemas/auth.ts`, `test/unit/auth-schemas.test.ts`
  - Erfüllt: AK-1.3, AK-1.4 (Regeln), AK-1.5 (Grundlage)
  - Prüfung: Unit-Tests für die Grenzwerte: Passwort 9/10/128/129 Zeichen, Name 1/2/40/41 Zeichen und nach dem Trimmen. Die E-Mail wird kleingeschrieben. Die Schemas sind in `app/` und `server/` auto-importierbar (Typecheck).

- [ ] 4. Passwörter
  - Dateien: `server/utils/password.ts`, `test/unit/password.test.ts`
  - Erfüllt: AK-1.4, AK-6.1 (Einmal-Passwort)
  - Prüfung:
    - Der Hash beginnt mit `$argon2id$` und enthält die Parameter `m=19456,t=2,p=1`.
    - `verify` liefert für das richtige Passwort wahr, für ein falsches falsch.
    - Ein Einmal-Passwort hat ≥ 16 Zeichen und keine verwechselbaren Zeichen.
    - `verifyDummy` braucht ungefähr so lange wie `verify` (±50 %).

- [ ] 5. Rate-Limiter und Client-IP
  - Dateien: `server/utils/rate-limit.ts`, `server/utils/client-ip.ts`, `test/unit/rate-limit.test.ts`
  - Erfüllt: AK-8.1–AK-8.3 (Baustein)
  - Prüfung:
    - Unit-Tests mit Fake-Timern: Limit erreicht → `ok: false` mit korrektem `retryAfterSec`, neues Fenster → wieder `ok`, `reset` setzt zurück.
    - Die IP berücksichtigt `X-Forwarded-For` nur bei `TRUST_PROXY=true`.

- [ ] 6. Audit-Log
  - Dateien: `server/utils/audit.ts`, `test/unit/audit.test.ts`
  - Erfüllt: AK-11.1 (Baustein), AK-11.2
  - Prüfung: Ein Unit-Test zeigt, dass `details` keine Schlüssel wie `password`, `token`, `hash` oder `session` durchlässt. Ein Schreibfehler wird geloggt und bricht die Aktion nicht ab.

- [ ] 7. Sessions, Auth-Middleware und Rechte
  - Dateien: `server/utils/session.ts`, `server/middleware/auth.ts`, `server/utils/authz.ts`, `test/unit/authz.test.ts`
  - Erfüllt: AK-2.3–AK-2.7, AK-6.2 (Server), AK-7.1, AK-7.2
  - Prüfung:
    - Unit-Tests: Rollenhierarchie; `requireUser`/`requireRole` → 401/403.
    - Die Session-Logik prüfen die API-Tests in Aufgabe 8.

- [ ] 8. Auth-API: register, login, logout, me, password
  - Dateien: `server/api/auth/*.ts`, `test/api/helpers.ts`, `test/api/auth.test.ts`, `test/api/security.test.ts`
  - Erfüllt: AK-1.1, AK-1.2, AK-1.5, AK-2.1–AK-2.7, AK-3.1, AK-3.2, AK-8.1–AK-8.3, AK-9.1, AK-11.1 (Auth-Ereignisse)
  - Prüfung (API-Tests):
    - Registrierung → `me` liefert den Nutzer; doppelte E-Mail → 409.
    - Login falsch → 401 mit derselben Meldung für unbekannte und bekannte E-Mail.
    - Cookie-Attribute; `Max-Age` nur mit `remember`.
    - Logout → das alte Cookie wird von `me` mit `null` beantwortet.
    - Abgelaufene Session (`expiresAt` in der Test-DB zurückgesetzt) → `null`.
    - Gesperrter Nutzer → Login abgelehnt.
    - Passwortwechsel → zweite Session ungültig, aktuelle gültig.
    - 6. Fehlversuch → 429 mit `Retry-After`.
    - POST ohne bzw. mit falschem CSRF-Token → 403.

- [ ] 9. Erster Admin über ADMIN_EMAIL
  - Dateien: `server/plugins/admin-bootstrap.ts`, `server/api/auth/register.post.ts` (Abgleich), `test/api/auth.test.ts`
  - Erfüllt: AK-4.1, AK-4.2
  - Prüfung:
    - API-Test: Registrierung mit `ADMIN_EMAIL` → Rolle `admin`, Audit `ADMIN_BOOTSTRAPPED`.
    - Manuell: Ein bestehender Nutzer mit dieser E-Mail wird nach einem Serverneustart Admin.

- [ ] 10. Admin-API: Nutzer, Rollen, Passwort-Reset, Audit
  - Dateien: `server/api/admin/users/index.get.ts`, `server/api/admin/users/[id]/role.patch.ts`, `server/api/admin/users/[id]/password-reset.post.ts`, `server/api/admin/audit.get.ts`, `test/api/admin.test.ts`, `test/api/audit.test.ts`
  - Erfüllt: AK-5.1–AK-5.3, AK-5.4 (API), AK-6.1–AK-6.3, AK-7.3, AK-11.1, AK-11.3 (API)
  - Prüfung (API-Tests):
    - Jede Admin-Route: Gast 401, Nutzer 403, Moderator 403, Admin 2xx.
    - Suche und Seitenumbruch funktionieren.
    - Rolle ändern wirkt bei der nächsten Anfrage des Nutzers.
    - Eigene Rolle bzw. letzter Admin → 409.
    - Reset: Antwort mit `Cache-Control: no-store`; altes Passwort ungültig; alle Sessions beendet; mit dem Einmal-Passwort → 403 `PASSWORD_CHANGE_REQUIRED` bis zum Wechsel.
    - Audit-Einträge für alle Ereignistypen, ohne Geheimnisse; Filter funktionieren.

- [ ] 11. Frontend-Grundlage: $api, Auth-Zustand, Middleware, Nutzermenü
  - Dateien: `app/plugins/api.ts`, `app/plugins/auth.ts`, `app/composables/useAuth.ts`, `app/middleware/{auth,guest,admin}.ts`, `app/middleware/password-change.global.ts`, `app/components/UserMenu.vue`, `app/layouts/default.vue`, `i18n/locales/*.json`
  - Erfüllt: AK-2.8, AK-5.4 (UI), AK-6.2 (UI), AK-9.2
  - Prüfung:
    - Gast sieht „Anmelden“ und „Registrieren“.
    - SSR mit gültigem Cookie zeigt den Anzeigenamen ohne Flackern.
    - Ein Gast auf `/admin` landet auf `/login`, ein Nutzer auf `/admin` auf `/`.
    - Bei 360 px ist das Menü bedienbar.

- [ ] 12. Seiten: Anmelden, Registrieren, Passwort ändern
  - Dateien: `app/pages/login.vue`, `app/pages/register.vue`, `app/pages/account/password.vue`, `app/composables/useFormErrors.ts`, `i18n/locales/*.json`, `test/unit/i18n.test.ts` (bleibt grün)
  - Erfüllt: AK-1.1, AK-1.5 (UI), AK-2.1–AK-2.4 (UI), AK-3.1, AK-3.2 (UI), AK-6.2 (UI), AK-12.1, AK-12.2
  - Prüfung im Browser, auf Deutsch und Englisch:
    - registrieren → angemeldet; abmelden; anmelden mit/ohne „Angemeldet bleiben“
    - falsches Passwort → Meldung
    - zu kurzes Passwort → übersetzte Feldmeldung
    - Passwort ändern
    - Pflichtwechsel nach Admin-Reset leitet auf `/account/password`
    - 360 px ohne horizontales Scrollen

- [ ] 13. Admin-Seiten
  - Dateien: `app/pages/admin/index.vue`, `app/pages/admin/users.vue`, `app/pages/admin/audit.vue`, `i18n/locales/*.json`
  - Erfüllt: AK-5.1–AK-5.3 (UI), AK-6.1 (UI), AK-11.3 (UI), AK-12.1, AK-12.2
  - Prüfung im Browser:
    - Liste, Suche und Seitenumbruch funktionieren.
    - Die Rolle lässt sich ändern; Fehler wie „letzter Admin“ erscheinen verständlich.
    - Der Reset-Dialog zeigt das Einmal-Passwort einmal und kopiert es.
    - Die Audit-Liste lässt sich filtern.
    - 360 px ohne horizontales Scrollen; Tabellen scrollen dabei innerhalb ihres Containers.

- [ ] 14. Dokumentation
  - Dateien: `README.md` (`ADMIN_EMAIL`, `CSRF_SECRET`, Admin-Bereich), `.claude/skills/nuxt-dev/SKILL.md` (CSRF in curl-Prüfungen)
  - Erfüllt: AK-4.3
  - Prüfung: Die README erklärt, wie man der erste Admin wird, und warnt vor dem offenen `ADMIN_EMAIL`.

- [ ] 15. Abschluss
  - Erfüllt: alle AKs (Endabnahme)
  - Ablauf:
    1. `npm run lint`, `npm run typecheck`, `npm test` und `npm run build` laufen fehlerfrei.
    2. Im Browser gibt es keine CSP-Verstöße, weder im Dev noch in Production (AK-10.2), über alle neuen Seiten.
    3. Jedes AK einzeln prüfen und als Tabelle (AK | Ergebnis | Nachweis) melden.
    4. Status von `requirements.md`, `design.md` und `tasks.md` auf „umgesetzt“ setzen.
    5. Push nur nach Rücksprache (zusammen mit dem offenen Push aus 01).
