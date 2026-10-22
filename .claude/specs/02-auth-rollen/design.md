# Design: 02 – Auth & Rollen

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-22)**

## Überblick

Baut auf 01 auf: Fehlerformat (`AppError`), Request-ID, Logger, Prisma, i18n, Vuetify-Layout.

```
Browser ── Cookie session (HttpOnly) + Cookie csrf + Header csrf-token
   │
Nitro
 ├─ nuxt-security       Security-Header + CSP-Nonce (alle Antworten)
 ├─ nuxt-csurf          CSRF-Prüfung für POST/PUT/PATCH/DELETE
 ├─ middleware/auth.ts  Session-Cookie → event.context.user; Pflicht-Passwortwechsel
 ├─ api/auth/*          register, login, logout, me, password
 ├─ api/admin/*         users (Liste, Rolle, Passwort-Reset), audit
 └─ utils               password (Argon2id), session, authz, rateLimit, audit
       │
     Prisma ── User, Session, AuditLog
```

Sessions liegen **in der Datenbank** und nicht in einem signierten Cookie, weil Logout, Passwortwechsel und Admin-Reset Sessions serverseitig beenden müssen (AK-2.5, 3.1, 6.1).

## Anpassung der Anforderungen

**AK-1.2 war so nicht erfüllbar** (in `requirements.md` angepasst). Eine erfolgreiche Registrierung meldet den Nutzer sofort an (AK-1.1), eine abgelehnte nicht. Am fehlenden Session-Cookie erkennt man deshalb immer, dass die Adresse vergeben ist. Ganz verbergen lässt sich das nur mit E-Mail-Bestätigung, und die ist laut Overview §16 nicht im MVP.

Vorschlag für die neue Fassung:

> **AK-1.2:** WENN die E-Mail (ohne Beachtung von Groß-/Kleinschreibung) schon vergeben ist, DANN wird kein Konto angelegt, und es erscheint die allgemeine Meldung „Registrierung mit diesen Daten nicht möglich“ (409 `REGISTRATION_FAILED`). Das Rate-Limit (AK-8.2) begrenzt das Durchprobieren von Adressen. Ein vollständiges Verbergen kommt mit der E-Mail-Bestätigung (Overview §16).

Beim Login (AK-2.2) ist ein vollständiges Verbergen möglich: Für unbekannte E-Mails wird gegen einen Dummy-Hash geprüft, damit die Antwortzeit gleich bleibt.

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `package.json` | geändert | `@node-rs/argon2`, `nuxt-security`, `nuxt-csurf` |
| `nuxt.config.ts` | geändert | Module `nuxt-security` (inkl. CSRF), Konfiguration |
| `.env.example`, `.env` | geändert | `ADMIN_EMAIL`, `TRUST_PROXY`, `NUXT_CSURF_ENCRYPT_SECRET` |
| `prisma/schema.prisma` | geändert | `Role`, `User`, `Session`, `AuditEvent`, `AuditLog` |
| `prisma/migrations/0002_auth/` | neu | Migration |
| `shared/schemas/auth.ts` | neu | zod-Schemas für Client und Server (Registrierung, Login, Passwort, Rolle) |
| `shared/types/auth.ts` | neu | `Role`, `PublicUser`, `AdminUser`, `AuditEntry`, `Page<T>` |
| `shared/utils/roles.ts` | neu | `ROLES`, `ROLE_RANK`, `hasRole`, `AUDIT_EVENTS` (auto-importiert in App und Server) |
| `server/utils/env.ts` | geändert | neue Variablen |
| `server/utils/errors.ts` | geändert | CSRF-Fehler → `CSRF_INVALID`, 429 → `RATE_LIMITED` |
| `server/utils/password.ts` | neu | `hashPassword`, `verifyPassword`, `verifyDummy`, `generateTemporaryPassword` |
| `server/utils/session.ts` | neu | `createSession`, `resolveSession`, `destroySession`, `destroyUserSessions` |
| `server/utils/authz.ts` | neu | `requireUser`, `requireRole`, `hasRole` |
| `server/utils/rate-limit.ts` | neu | In-Memory-Zähler mit festem Zeitfenster |
| `server/utils/audit.ts` | neu | `audit(event, entry)` |
| `server/utils/client-ip.ts` | neu | IP mit/ohne `X-Forwarded-For` je nach `TRUST_PROXY` |
| `server/middleware/auth.ts` | neu | Session laden, Pflicht-Passwortwechsel durchsetzen |
| `server/plugins/admin-bootstrap.ts` | neu | `ADMIN_EMAIL` beim Start befördern (AK-4.2) |
| `server/api/auth/register.post.ts` | neu | Registrierung |
| `server/api/auth/login.post.ts` | neu | Anmeldung |
| `server/api/auth/logout.post.ts` | neu | Abmeldung |
| `server/api/auth/me.get.ts` | neu | aktueller Nutzer |
| `server/api/auth/password.post.ts` | neu | Passwort ändern |
| `server/api/admin/users/index.get.ts` | neu | Nutzerliste |
| `server/api/admin/users/[id]/role.patch.ts` | neu | Rolle ändern |
| `server/api/admin/users/[id]/password-reset.post.ts` | neu | Einmal-Passwort |
| `server/api/admin/audit.get.ts` | neu | Audit-Log |
| `app/plugins/api.ts` | neu | `$api` = `$fetch` mit CSRF-Header |
| `app/plugins/auth.ts` | neu | lädt den Nutzer beim Start (SSR) |
| `app/composables/useAuth.ts` | neu | Nutzerzustand, `login`, `register`, `logout`, `changePassword` |
| `app/composables/useFormErrors.ts` | neu | zod-Fehler → übersetzte Feldmeldungen |
| `app/middleware/auth.ts`, `guest.ts`, `admin.ts` | neu | Seitenschutz |
| `app/middleware/password-change.global.ts` | neu | Pflichtwechsel → `/account/password` |
| `app/components/UserMenu.vue` | neu | App-Bar: Gast-Links bzw. Nutzermenü |
| `app/layouts/default.vue` | geändert | `UserMenu` einbinden |
| `app/pages/login.vue`, `register.vue` | neu | Formulare |
| `app/pages/account/password.vue` | neu | Passwort ändern / Pflichtwechsel |
| `app/pages/admin/index.vue` | neu | leitet auf `/admin/users` um |
| `app/pages/admin/users.vue` | neu | Nutzerliste, Rolle, Reset-Dialog |
| `app/pages/admin/audit.vue` | neu | Audit-Liste mit Filtern |
| `i18n/locales/de.json`, `en.json` | geändert | neue Texte |
| `test/unit/*.test.ts` | neu | siehe Tests |
| `test/api/*.test.ts`, `test/api/helpers.ts` | neu | siehe Tests |
| `README.md` | geändert | `ADMIN_EMAIL`, Admin-Bereich |

## Abhängigkeiten

| Paket | Zweck | Begründung |
|---|---|---|
| `@node-rs/argon2` | Argon2id | Fertige Binaries, kein `node-gyp`, aktiv gepflegt |
| `nuxt-security` 2.6 | Header, CSP-Nonce, CSRF-Einbindung | Verbreitetes Nuxt-Modul. Den eigenen Rate-Limiter und `xssValidator` schalte ich ab |
| `nuxt-csurf` 1.6 | CSRF (wird von `nuxt-security` installiert) | Double-Submit mit verschlüsseltem Token, Token per `<meta>` im HTML |

Laut Dokumentation laufen `nuxt-security` und `nuxt-csurf` mit Nuxt 4.6 (Hinweis des Nutzers, 2026-10-22). Aufgabe 1 bestätigt das nach der Installation mit Build und Typecheck.

## Datenmodell

```prisma
enum Role {
  user
  moderator
  admin
}

model User {
  id                 String    @id @default(uuid(7)) @db.Uuid
  email              String    @unique            // immer kleingeschrieben gespeichert
  displayName        String    @db.VarChar(40)
  passwordHash       String
  role               Role      @default(user)
  mustChangePassword Boolean   @default(false)
  blockedAt          DateTime?                    // gesetzt in Slice 05
  createdAt          DateTime  @default(now())
  lastLoginAt        DateTime?
  sessions           Session[]
  auditAsActor       AuditLog[] @relation("AuditActor")
  auditAsTarget      AuditLog[] @relation("AuditTarget")

  @@index([displayName])
}

model Session {
  id         String   @id                 // SHA-256 (hex) des Tokens, nie das Token selbst
  userId     String   @db.Uuid
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  remember   Boolean
  expiresAt  DateTime
  lastSeenAt DateTime @default(now())
  createdAt  DateTime @default(now())

  @@index([userId])
  @@index([expiresAt])
}

enum AuditEvent {
  USER_REGISTERED
  LOGIN_SUCCEEDED
  LOGIN_FAILED
  LOGOUT
  PASSWORD_CHANGED
  PASSWORD_RESET_BY_ADMIN
  ROLE_CHANGED
  ADMIN_BOOTSTRAPPED
}

model AuditLog {
  id        BigInt     @id @default(autoincrement())
  createdAt DateTime   @default(now())
  event     AuditEvent
  actorId   String?    @db.Uuid
  actor     User?      @relation("AuditActor", fields: [actorId], references: [id], onDelete: SetNull)
  targetId  String?    @db.Uuid
  target    User?      @relation("AuditTarget", fields: [targetId], references: [id], onDelete: SetNull)
  ip        String?
  requestId String?
  details   Json?      // z.B. { from: "user", to: "admin" } oder { email } bei LOGIN_FAILED

  @@index([createdAt])
  @@index([event, createdAt])
  @@index([targetId, createdAt])
}
```

```ts
// shared/types/auth.ts
export type Role = 'user' | 'moderator' | 'admin'
export const ROLE_RANK: Record<Role, number> = { user: 0, moderator: 1, admin: 2 }
export interface PublicUser { id: string, email: string, displayName: string, role: Role, mustChangePassword: boolean }
```

Die E-Mail steht in `PublicUser`, weil der Typ nur an den Nutzer selbst und an Admins geht. Öffentliche Ansichten in späteren Slices bekommen einen eigenen Typ ohne E-Mail.

## Passwörter

- Argon2id mit den OWASP-Mindestwerten: `memoryCost: 19456` (19 MiB), `timeCost: 2`, `parallelism: 1`.
- `verifyDummy()` prüft gegen einen beim Start erzeugten Hash. So dauert ein Login mit unbekannter E-Mail genauso lange wie einer mit falschem Passwort.
- `generateTemporaryPassword()`: 18 Zeichen aus `crypto.randomInt` über ein Alphabet ohne verwechselbare Zeichen (`0/O`, `1/l/I`).
- Schema (`shared/schemas/auth.ts`): `password: z.string().min(10).max(128)`, `displayName: z.string().trim().min(2).max(40)`, `email: z.email().max(254).transform(toLowerCase)`.

## Sessions

| Eigenschaft | Wert |
|---|---|
| Token | 32 Byte aus `crypto.randomBytes`, base64url (256 Bit, AK-2.6) |
| DB-Schlüssel | `sha256(token)` als Hex-String |
| Cookie | Name `session` (in Production `__Host-session`), `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in Production |
| Ohne „Angemeldet bleiben“ | Cookie ohne `Max-Age`; `expiresAt = jetzt + 12 h` |
| Mit „Angemeldet bleiben“ | Cookie `Max-Age = 30 Tage`; `expiresAt = jetzt + 30 Tage` |
| Verlängerung | Bei jeder Anfrage, aber nur, wenn `lastSeenAt` älter als 60 s ist (spart Schreibzugriffe). Bei `remember` wird dabei auch das Cookie neu gesetzt |
| Aufräumen | Abgelaufene Sessions werden beim Auflösen gelöscht. Zusätzlich räumt ein Nitro-Task stündlich auf |

`resolveSession(event)` lädt die Session zusammen mit dem Nutzer und beendet sie in drei Fällen: abgelaufen, Nutzer gesperrt (AK-2.7) oder Nutzer nicht mehr vorhanden.

## Middleware und Rechte

`server/middleware/auth.ts` läuft für jede Anfrage:
1. `event.context.user = await resolveSession(event)` (oder `null`)
2. Ist `user.mustChangePassword` gesetzt und der Pfad unter `/api/` nicht `/api/auth/password`, `/api/auth/logout` oder `/api/auth/me`, wirft sie `AppError(403, 'PASSWORD_CHANGE_REQUIRED')` (AK-6.2).

`server/utils/authz.ts`:

```ts
export function requireUser(event: H3Event): PublicUser            // sonst AppError(401, 'UNAUTHENTICATED')
export function requireRole(event: H3Event, role: Role): PublicUser // sonst 401 bzw. AppError(403, 'FORBIDDEN')
export function hasRole(user: PublicUser | null, role: Role): boolean  // ROLE_RANK-Vergleich (AK-7.2)
```

Jede Admin-Route beginnt mit `requireRole(event, 'admin')`.

## Rate-Limiting

`server/utils/rate-limit.ts` zählt im Speicher mit festem Zeitfenster. Das reicht, weil im MVP nur eine Instanz läuft (siehe „Nicht im Umfang“).

```ts
export function hit(key: string, limit: number, windowMs: number): { ok: boolean, retryAfterSec: number }
export function reset(key: string): void
```

| Schlüssel | Limit | Zählt | AK |
|---|---|---|---|
| `login:ip:<ip>` | 10 / 15 min | jeden Login-Versuch | 8.1 |
| `login:email:<email>` | 5 / 15 min | nur Fehlversuche; bei Erfolg `reset` | 8.1, 8.3 |
| `register:ip:<ip>` | 5 / 60 min | jede Registrierung | 8.2 |

Bei Überschreitung gibt es `AppError(429, 'RATE_LIMITED')` und den Header `Retry-After`. Die IP liefert `getClientIp(event)`: `X-Forwarded-For` wird nur ausgewertet, wenn `TRUST_PROXY=true` ist, sonst gilt die Socket-Adresse.

## CSRF

- `nuxt-security` mit `csrf: { methodsToProtect: ['POST', 'PUT', 'PATCH', 'DELETE'] }`; der Schlüssel kommt aus `NUXT_CSURF_ENCRYPT_SECRET`.
- Das Token kommt per `<meta name="csrf-token">` ins HTML. Das Plugin `app/plugins/api.ts` stellt `$api` bereit: `$fetch.create` mit dem Header `csrf-token` aus `useCsrf()`. Alle Formulare und Composables verwenden `$api` (AK-9.2).
- `toErrorResponse` bildet den Fehler von `nuxt-csurf` (H3-Fehler 403 mit `statusMessage: 'CSRF Token Mismatch'`) auf `CSRF_INVALID` ab.

## Security-Header (`nuxt-security`)

```ts
security: {
  nonce: true,
  headers: {
    contentSecurityPolicy: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'strict-dynamic'", "'nonce-{{nonce}}'"],
      'style-src': ["'self'", "'unsafe-inline'"],   // Vuetify setzt Theme-Variablen als Inline-Style
      'img-src': ["'self'", 'data:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],                     // im Dev zusätzlich ws: für Vite-HMR
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'base-uri': ["'none'"],
      'object-src': ["'none'"],
    },
    xFrameOptions: 'DENY',
    referrerPolicy: 'strict-origin-when-cross-origin',
    strictTransportSecurity: production ? { maxAge: 31536000, includeSubdomains: true } : false,
  },
  rateLimiter: false,      // eigener Limiter, siehe oben
  xssValidator: false,     // verändert/blockiert legitime Eingaben; wir validieren mit zod und escapen in Vue
}
```

`'unsafe-inline'` steht nur bei `style-src`. Aufgabe 1 hat geprüft, dass Vuetify es braucht: Ohne gibt es über 80 Verstöße, und Theme-Farben fehlen (2026-10-22).

## Audit-Log

```ts
// server/utils/audit.ts
export async function audit(event: H3Event | null, entry: {
  event: AuditEvent, actorId?: string | null, targetId?: string | null, details?: Record<string, unknown>
}): Promise<void>
```

- `ip` und `requestId` kommen aus dem `event`. Ein Fehler beim Schreiben wird geloggt, bricht die Aktion aber nicht ab.
- `details` erlaubt nur bekannte, unkritische Felder. Ein Unit-Test prüft, dass weder `password` noch `token`, `hash` oder `session` darin landen (AK-11.2).
- Die DB-Rechte werden in 02 nicht eingeschränkt. Eine Änderungssperre gibt es nur über die API: Es existiert keine Route zum Ändern oder Löschen (AK-11.3).

## API

Alle schreibenden Routen brauchen ein CSRF-Token. Fehler kommen im Format aus 01.

| Methode | Route | Rolle | Request | Response | Fehler |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | – | `{ email, displayName, password, remember? }` | `201 { user: PublicUser }` + Cookie | 400, 409 `REGISTRATION_FAILED`, 429 |
| POST | `/api/auth/login` | – | `{ email, password, remember? }` | `200 { user }` + Cookie | 400, 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_BLOCKED`, 429 |
| POST | `/api/auth/logout` | user | – | `204`, Cookie gelöscht | 401 |
| GET | `/api/auth/me` | – | – | `200 { user: PublicUser \| null }` | – |
| POST | `/api/auth/password` | user | `{ currentPassword, newPassword }` | `204` | 400, 401, 403 `INVALID_CREDENTIALS`, 429 (5 / 15 min pro Nutzer) |
| GET | `/api/admin/users` | admin | `?q&page` | `200 { items: AdminUser[], total, page, pageSize: 25 }` | 401, 403 |
| PATCH | `/api/admin/users/:id/role` | admin | `{ role }` | `200 { user: AdminUser }` | 400, 401, 403, 404, 409 `LAST_ADMIN` / `SELF_ROLE_CHANGE` |
| POST | `/api/admin/users/:id/password-reset` | admin | – | `200 { temporaryPassword }` + `Cache-Control: no-store` | 401, 403, 404 |
| GET | `/api/admin/audit` | admin | `?event&userId&page` | `200 { items: AuditEntry[], total, page, pageSize: 50 }` | 400, 401, 403 |

- `AdminUser` = `PublicUser` + `createdAt`, `lastLoginAt`.
- `AuditEntry` enthält zusätzlich die Anzeigenamen von Akteur und Ziel.
- „Letzter Admin“ wird in einer Transaktion geprüft: Bleibt nach der Änderung `count(role = admin) ≥ 1`?

## UI

| Route | Schutz | Inhalt |
|---|---|---|
| `/login` | `guest` | E-Mail, Passwort, „Angemeldet bleiben“; Link zur Registrierung |
| `/register` | `guest` | E-Mail, Anzeigename, Passwort (mit Zeichenzähler), „Angemeldet bleiben“ |
| `/account/password` | `auth` | Aktuelles und neues Passwort; bei Pflichtwechsel mit Hinweistext |
| `/admin` | `admin` | Umleitung auf `/admin/users` |
| `/admin/users` | `admin` | `v-data-table-server` mit Suche; Rolle per `v-select` direkt in der Zeile; Menü „Passwort zurücksetzen“ → Bestätigungsdialog → Dialog mit Einmal-Passwort und Kopier-Button |
| `/admin/audit` | `admin` | `v-data-table-server` mit Filtern für Ereignistyp und Nutzer |

Unter `/en/...` gibt es jeweils die englische Variante (`prefix_except_default`).

- **`useAuth()`:** Der Nutzer liegt in `useState('auth:user')`. `app/plugins/auth.ts` lädt `/api/auth/me` beim ersten Rendern auf dem Server und schickt dabei das Cookie mit (`useRequestFetch`).
- **Seiten-Middleware:**
  - `auth` leitet Gäste auf `/login?redirect=…` um.
  - `guest` leitet angemeldete Nutzer auf `/` um.
  - `admin` leitet Nicht-Admins auf `/` und Gäste auf `/login` um (AK-5.4).
  - Die globale Middleware `password-change` erzwingt `/account/password`.
- **`UserMenu.vue`:** Gäste sehen die Buttons „Anmelden“ und „Registrieren“, auf schmalen Bildschirmen als Icon-Menü. Angemeldete Nutzer sehen ein Avatar-Menü mit Anzeigename und den Einträgen aus AK-2.8.
- **Formularfehler:**
  - Der Client prüft mit demselben zod-Schema wie der Server.
  - `useFormErrors` übersetzt die zod-Codes (`too_small`, `too_big`, `invalid_format`) in i18n-Schlüssel `validation.*`. Unter jedem Feld erscheint die Meldung in der aktuellen Sprache (AK-1.5).
  - Fehler vom Server mit bekanntem Code (`INVALID_CREDENTIALS`, `RATE_LIMITED` usw.) zeigt das Formular über `errors.<CODE>` an.

## Konfiguration

`.env.example` bekommt diese Ergänzungen:

```dotenv
# E-Mail, die bei Registrierung bzw. Serverstart automatisch Admin wird.
# Vor dem Öffnen der Registrierung setzen und selbst registrieren!
ADMIN_EMAIL=
# Nur hinter einem Reverse Proxy auf true setzen (wertet X-Forwarded-For aus)
TRUST_PROXY=false
# Schlüssel für CSRF-Tokens, genau 32 Zeichen, in Production Pflicht: openssl rand -base64 24
NUXT_CSURF_ENCRYPT_SECRET=
```

`envSchema` bekommt die Felder `ADMIN_EMAIL` (optionale E-Mail, kleingeschrieben), `TRUST_PROXY` (Boolean, Standard `false`) und `NUXT_CSURF_ENCRYPT_SECRET`.

**Geändert in Aufgabe 1:** Die Variable heißt `NUXT_CSURF_ENCRYPT_SECRET` statt `CSRF_SECRET`. `nuxt-csurf` liest den Schlüssel aus `runtimeConfig.csurf.encryptSecret`. Ohne Vorgabe erzeugt es ihn beim Build und schreibt ihn in die Build-Artefakte. Über den Nuxt-Mechanismus `NUXT_…` wird er zur Laufzeit gesetzt. Er muss genau 32 Zeichen haben (AES-256) und ist in Production Pflicht.

## Tests

| Projekt | Datei | Inhalt |
|---|---|---|
| unit | `password.test.ts` | Hash ≠ Passwort und beginnt mit `$argon2id$`; verify richtig/falsch; Einmal-Passwort hat ≥ 16 Zeichen und kein verwechselbares Zeichen |
| unit | `rate-limit.test.ts` | Limit, `retryAfterSec`, neues Fenster, `reset` (mit Fake-Timern) |
| unit | `authz.test.ts` | Rollenhierarchie, 401/403 |
| unit | `auth-schemas.test.ts` | Grenzwerte (Länge 9/10/128/129, Name 1/2/40/41, E-Mail wird kleingeschrieben und getrimmt) |
| unit | `audit.test.ts` | `details` filtert sensible Schlüssel |
| unit | `errors.test.ts` | ergänzt: CSRF → `CSRF_INVALID`, 429 → `RATE_LIMITED` |
| api | `auth.test.ts` | Registrierung → `me`; doppelte E-Mail → 409; Login falsch/richtig; Logout macht das alte Cookie wertlos; Passwortwechsel beendet die anderen Sessions; Cookie-Attribute; `remember` setzt `Max-Age` |
| api | `admin.test.ts` | Jede Admin-Route: Gast 401, Nutzer 403, Admin 200; Rolle ändern; keine Selbständerung/kein Entfernen des letzten Admins; Reset → altes Passwort ungültig, Pflichtwechsel → 403 `PASSWORD_CHANGE_REQUIRED` bis zur Änderung |
| api | `security.test.ts` | POST ohne bzw. mit falschem CSRF-Token → 403 `CSRF_INVALID`; Security-Header vorhanden; Rate-Limit Login (6. Fehlversuch → 429 + `Retry-After`) |
| api | `audit.test.ts` | Die Aktionen oben erzeugen die erwarteten Einträge, ohne Geheimnisse |

- `test/api/helpers.ts`: `createClient()` ruft `/` mit `Accept: text/html` auf, liest Cookie und `<meta name="csrf-token">` und hält die Cookies über mehrere Anfragen.
- `test/setup/global-api.ts`: Vor jedem Lauf werden die Tabellen in `tea_test` geleert (`TRUNCATE ... CASCADE`).
- Für Session-Ablauf und Rate-Limit-Fenster setzen die Tests Zeitstempel direkt in der Test-DB bzw. nutzen Fake-Timer, statt zu warten.
- **Ergänzt in Aufgabe 8:**
  - Die API-Tests laufen gegen einen Production-Build. Nitro setzt `NODE_ENV` dort beim Build fest auf `production`. Die Tests prüfen deshalb das Cookie `__Host-session` mit `Secure`. In der CI ist `NUXT_CSURF_ENCRYPT_SECRET` gesetzt.
  - Der Testserver läuft mit `TRUST_PROXY=true`. Jeder Test-Client schickt eine eigene `X-Forwarded-For`-IP, damit sich die IP-Limits nicht über Tests hinweg summieren.
  - Das `api`-Projekt läuft mit höchstens 2 Workern, weil mehr parallele Builds 8 GB RAM sprengen.
  - Der Login beendet eine bereits bestehende Session des Browsers, bevor er eine neue anlegt.
- **Ergänzt in Aufgabe 10:**
  - Die Audit-Tests stehen in `admin.test.ts` statt in einer eigenen Datei, weil jede API-Testdatei einen eigenen App-Build braucht.
  - `LAST_ADMIN` ist über die API praktisch nicht auslösbar: Nur Admins ändern Rollen, und die eigene Rolle ist gesperrt. Die Zählung in einer `Serializable`-Transaktion schützt vor gleichzeitigen Änderungen.
  - `/api/health` bleibt während des Pflicht-Passwortwechsels erreichbar (Monitoring).
  - Hilfsfunktionen `toAdminUser` und `getUserIdParam` liegen in `server/utils/users.ts`. Eine ungültige ID ergibt 404.

## Entscheidungen

- **DB-Sessions statt signierter Cookies:** Serverseitiges Beenden ist Pflicht (AK-2.5, 3.1, 6.1). Verworfen: `nuxt-auth-utils`, weil die versiegelten Cookies nicht widerrufbar sind.
- **Nur der Token-Hash in der DB:** Ein DB-Leak erlaubt so keine Übernahme von Sessions (AK-2.6).
- **Eigener Rate-Limiter:** `nuxt-security` zählt nur pro IP und Route, gebraucht wird auch „pro E-Mail, nur Fehlversuche“. In-Memory reicht für eine Instanz. Verworfen: Redis, weil es einen zusätzlichen Dienst ohne Nutzen im MVP bedeutet.
- **`nuxt-security` + `nuxt-csurf`:** Etablierte Lösung, CSP-Nonce für SSR inklusive. Verworfen: Header von Hand, weil die Nonce-Verwaltung bei SSR fehleranfällig ist.
- **`@node-rs/argon2` statt `argon2`:** Keine nativen Build-Tools nötig, läuft auch in der CI ohne Zusatzpakete.
- **Gemeinsame zod-Schemas in `shared/`:** Client und Server prüfen identisch. Nuxt 4 importiert nur `shared/utils/` und `shared/types/` automatisch; die Schemas werden explizit über `#shared/schemas/auth` importiert (Aufgabe 3).
- **`db:migrate` = `prisma migrate dev && prisma generate`:** Prisma 7 erzeugt den Client nach einer Migration nicht mehr automatisch (Aufgabe 3).
- **UUIDv7 als Nutzer-ID:** Nicht erratbar und zeitlich sortierbar. Verworfen: Integer-ID, weil sie die Nutzerzahl verrät und sich aufzählen lässt.
- **`SameSite=Lax` statt `Strict`:** Mit `Strict` wäre man nach einem Klick auf einen externen Link zur App scheinbar abgemeldet. CSRF deckt das Token ab.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | `register.post.ts`, `createSession`, `register.vue` |
| AK-1.2 | `register.post.ts` (409 `REGISTRATION_FAILED`), Rate-Limit |
| AK-1.3 | `shared/schemas/auth.ts` (`trim`, keine Unique-Constraint) |
| AK-1.4 | `password.ts` (Argon2id), Schema nur mit Länge |
| AK-1.5 | zod → 400 (01), `useFormErrors`, `validation.*` |
| AK-2.1 | `login.post.ts`, `session.ts` (Cookie-Attribute) |
| AK-2.2 | `login.post.ts` (`INVALID_CREDENTIALS`, `verifyDummy`) |
| AK-2.3, 2.4 | `session.ts` (12 h / 30 Tage, gleitend) |
| AK-2.5 | `logout.post.ts`, `destroySession` |
| AK-2.6 | `session.ts` (256 Bit, SHA-256, neue ID je Login) |
| AK-2.7 | `User.blockedAt`, `resolveSession`, `login.post.ts` |
| AK-2.8 | `UserMenu.vue` |
| AK-3.1, 3.2 | `password.post.ts`, `destroyUserSessions(userId, { except })` |
| AK-4.1 | `register.post.ts` (Vergleich mit `ADMIN_EMAIL`) |
| AK-4.2 | `server/plugins/admin-bootstrap.ts` |
| AK-4.3 | `.env.example`, README |
| AK-5.1–5.3 | `admin/users/*`, `admin/users.vue` |
| AK-5.4 | `app/middleware/admin.ts`, `requireRole` |
| AK-6.1–6.3 | `password-reset.post.ts`, `server/middleware/auth.ts`, `password-change.global.ts` |
| AK-7.1, 7.2 | `authz.ts` |
| AK-7.3 | `test/api/admin.test.ts` |
| AK-8.1–8.3 | `rate-limit.ts`, `login.post.ts`, `register.post.ts` |
| AK-9.1, 9.2 | `nuxt-csurf`, `app/plugins/api.ts`, `errors.ts` |
| AK-10.1, 10.2 | `nuxt-security`-Konfiguration, Browserprüfung |
| AK-11.1–11.3 | `AuditLog`, `audit.ts`, `admin/audit.get.ts`, `admin/audit.vue` |
| AK-12.1–12.3 | Sprachdateien, Layout, Tests |
