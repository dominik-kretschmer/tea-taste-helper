# 02 – Auth & Rollen

> Feature-Spec zu [00 – Overview](../00%20–%20Overview:%20tea-taste-helper.md), Slice 02 (§3 Nutzer & Rollen, §11 Authentifizierung, §12 Sicherheit, §13 Audit-Log). Phase 1: Anforderungen.
> Status: **umgesetzt (2026-10-22)**, CI auf `main` grün (`0d69acb`). Freigegeben am 2026-10-22, AK-1.2 angepasst mit dem Design (2026-10-22): Bei Sofort-Anmeldung lässt sich nicht verbergen, dass eine Adresse vergeben ist.

## Ziel

Besucher können ein Konto anlegen und sich anmelden. Jedes Konto hat eine Rolle (Nutzer, Moderator, Admin), die der Server bei jeder Anfrage prüft. Admins vergeben Rollen und setzen vergessene Passwörter zurück. Dazu kommen die Schutzmaßnahmen, die ab jetzt für alle Slices gelten: CSRF-Schutz, Rate-Limiting, Security-Header und ein Audit-Log.

## User Stories

- **US-1:** Als Besucher möchte ich mich mit E-Mail, Anzeigename und Passwort registrieren, damit ich eigene Daten anlegen kann.
- **US-2:** Als Nutzer möchte ich mich an- und abmelden und wählen können, ob ich angemeldet bleibe, damit ich auf fremden Geräten sicher bin und auf eigenen bequem.
- **US-3:** Als Nutzer möchte ich mein Passwort ändern können.
- **US-4:** Als Betreiber möchte ich festlegen, welche E-Mail-Adresse automatisch Admin wird, damit es ohne Datenbankzugriff einen ersten Admin gibt.
- **US-5:** Als Admin möchte ich unter `/admin` alle Nutzer sehen und ihre Rolle ändern.
- **US-6:** Als Admin möchte ich das Passwort eines Nutzers zurücksetzen, weil es im MVP keinen Mailversand gibt.
- **US-7:** Als Betreiber möchte ich, dass Rechte immer serverseitig geprüft werden, damit versteckte Buttons kein Sicherheitsmerkmal sind.
- **US-8:** Als Betreiber möchte ich Login und Registrierung gegen massenhafte Versuche schützen.
- **US-9:** Als Nutzer möchte ich, dass fremde Webseiten keine Aktionen in meinem Namen auslösen können (CSRF).
- **US-10:** Als Betreiber möchte ich Security-Header (u.a. CSP) auf allen Antworten.
- **US-11:** Als Admin möchte ich sicherheitsrelevante Ereignisse im Audit-Log nachvollziehen können.

## Akzeptanzkriterien

### US-1 – Registrierung
- **AK-1.1:** WENN ein Besucher E-Mail, Anzeigename (2–40 Zeichen) und Passwort (10–128 Zeichen) eingibt, DANN wird ein Konto mit Rolle `user` angelegt und er ist sofort angemeldet.
- **AK-1.2:** WENN die E-Mail (ohne Beachtung von Groß-/Kleinschreibung) schon vergeben ist, DANN wird kein Konto angelegt, und es erscheint die allgemeine Meldung „Registrierung mit diesen Daten nicht möglich“ (409 `REGISTRATION_FAILED`). Das Rate-Limit (AK-8.2) begrenzt das Durchprobieren von Adressen. Ein vollständiges Verbergen kommt mit der E-Mail-Bestätigung (Overview §16).
- **AK-1.3:** Anzeigenamen müssen nicht eindeutig sein. Führende und folgende Leerzeichen werden entfernt.
- **AK-1.4:** Passwörter werden ausschließlich als Argon2id-Hash gespeichert. Es gibt keine Kompositionsregeln (Sonderzeichen o.ä.), nur die Länge zählt.
- **AK-1.5:** WENN eine Eingabe ungültig ist, DANN antwortet die API mit 400 `VALIDATION_ERROR`, und das Formular zeigt die Meldung am betroffenen Feld in der aktuellen Sprache.

### US-2 – Anmeldung & Session
- **AK-2.1:** WENN E-Mail und Passwort stimmen, DANN ist der Nutzer angemeldet. Die Session steckt in einem Cookie mit `HttpOnly`, `SameSite=Lax`, `Path=/` und in Production `Secure`.
- **AK-2.2:** WENN E-Mail oder Passwort falsch sind, DANN erscheint dieselbe Meldung, egal ob die E-Mail existiert, und es entsteht keine Session.
- **AK-2.3:** WENN „Angemeldet bleiben“ **nicht** gewählt ist, DANN ist das Cookie ein Sitzungscookie (ohne Ablaufdatum), und die Session läuft serverseitig nach 12 Stunden ohne Anfrage ab.
- **AK-2.4:** WENN „Angemeldet bleiben“ gewählt ist, DANN läuft die Session erst nach 30 Tagen ohne Anfrage ab. Jede Anfrage verlängert sie.
- **AK-2.5:** WENN der Nutzer sich abmeldet, DANN wird die Session serverseitig gelöscht, und das Cookie ist danach wertlos (auch eine Kopie davon).
- **AK-2.6:** Session-IDs sind zufällig (mindestens 128 Bit) und werden in der DB nur als Hash gespeichert. Bei jeder Anmeldung entsteht eine neue ID.
- **AK-2.7:** WENN ein gesperrter Nutzer sich anmelden will oder eine Session hat, DANN wird die Anmeldung abgelehnt bzw. die Session beendet. (Das Sperren selbst kommt in Slice 05; 02 legt nur das Feld an und prüft es.)
- **AK-2.8:** In der App-Bar sieht ein Gast „Anmelden“ und „Registrieren“, ein angemeldeter Nutzer ein Menü mit Anzeigename, „Passwort ändern“, „Abmelden“ und (nur für Admins) „Verwaltung“.

### US-3 – Passwort ändern
- **AK-3.1:** WENN der Nutzer sein aktuelles Passwort und ein neues gültiges Passwort eingibt, DANN wird das Passwort geändert, alle **anderen** Sessions des Nutzers enden, und die aktuelle bleibt bestehen.
- **AK-3.2:** WENN das aktuelle Passwort falsch ist, DANN bleibt alles unverändert, und eine Fehlermeldung erscheint.

### US-4 – Erster Admin
- **AK-4.1:** WENN `ADMIN_EMAIL` gesetzt ist und sich jemand mit genau dieser Adresse (ohne Beachtung von Groß-/Kleinschreibung) registriert, DANN erhält das Konto die Rolle `admin`.
- **AK-4.2:** WENN beim Serverstart bereits ein Konto mit `ADMIN_EMAIL` existiert, das nicht `admin` ist, DANN wird es zum Admin. Das wird im Audit-Log festgehalten.
- **AK-4.3:** `ADMIN_EMAIL` ist optional. `.env.example` und README weisen darauf hin, dass die Adresse vor dem Öffnen der Registrierung gesetzt und selbst registriert werden sollte, weil sonst jemand anderes sie belegen kann.

### US-5 – Rollenverwaltung
- **AK-5.1:** WENN ein Admin `/admin/users` aufruft, DANN sieht er eine Liste aller Nutzer mit Anzeigename, E-Mail, Rolle, Registrierungsdatum und letzter Anmeldung, durchsuchbar nach Name/E-Mail und seitenweise (25 pro Seite).
- **AK-5.2:** WENN ein Admin die Rolle eines Nutzers auf `user`, `moderator` oder `admin` ändert, DANN gilt die neue Rolle ab der nächsten Anfrage dieses Nutzers.
- **AK-5.3:** WENN ein Admin seine eigene Rolle ändern will oder die Änderung den letzten Admin entfernen würde, DANN wird sie abgelehnt.
- **AK-5.4:** WENN ein Nicht-Admin `/admin` aufruft, DANN wird er auf die Startseite umgeleitet (Gast: auf die Anmeldung); die zugehörigen API-Routen antworten mit 401 bzw. 403.

### US-6 – Passwort-Reset durch Admin
- **AK-6.1:** WENN ein Admin für einen Nutzer „Passwort zurücksetzen“ bestätigt, DANN erzeugt der Server ein zufälliges Einmal-Passwort (mindestens 16 Zeichen), das dem Admin genau einmal angezeigt wird, und alle Sessions des Nutzers enden.
- **AK-6.2:** WENN sich der Nutzer mit dem Einmal-Passwort anmeldet, DANN kann er nichts anderes tun, bis er ein neues Passwort gesetzt hat; API-Routen außer „Passwort ändern“ und „Abmelden“ antworten mit 403 `PASSWORD_CHANGE_REQUIRED`.
- **AK-6.3:** Das Einmal-Passwort wird nicht geloggt, nicht im Audit-Log gespeichert und nach der Anzeige nicht erneut ausgeliefert.

### US-7 – Rechteprüfung
- **AK-7.1:** Jede geschützte API-Route prüft Anmeldung und Rolle serverseitig. Ohne Anmeldung → 401 `UNAUTHENTICATED`, ohne ausreichende Rolle → 403 `FORBIDDEN` (Fehlerformat aus 01).
- **AK-7.2:** Rollen sind hierarchisch: `admin` darf alles, was `moderator` darf, und `moderator` alles, was `user` darf.
- **AK-7.3:** Es gibt für jede Admin-Route einen API-Test, der 401 (Gast) und 403 (Nutzer) prüft.

### US-8 – Rate-Limiting
- **AK-8.1:** WENN von einer IP mehr als 10 Login-Versuche in 15 Minuten kommen oder für eine E-Mail mehr als 5 fehlgeschlagene in 15 Minuten, DANN antwortet der Server mit 429 `RATE_LIMITED` und dem Header `Retry-After`.
- **AK-8.2:** WENN von einer IP mehr als 5 Registrierungen pro Stunde kommen, DANN antwortet der Server mit 429.
- **AK-8.3:** Ein erfolgreicher Login setzt den Zähler für diese E-Mail zurück.

### US-9 – CSRF
- **AK-9.1:** WENN eine Anfrage mit `POST`, `PUT`, `PATCH` oder `DELETE` an `/api/**` kein gültiges CSRF-Token mitschickt, DANN antwortet der Server mit 403 `CSRF_INVALID` und führt nichts aus.
- **AK-9.2:** Die App schickt das Token bei allen eigenen Anfragen automatisch mit; Formulare funktionieren ohne Zutun der einzelnen Seiten.

### US-10 – Security-Header
- **AK-10.1:** Jede Antwort enthält `Content-Security-Policy` (ohne `unsafe-eval`; `unsafe-inline` nur, wo Nuxt/Vuetify es nachweislich brauchen), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` bzw. `frame-ancestors 'none'` und in Production `Strict-Transport-Security`.
- **AK-10.2:** WENN die App mit diesen Headern im Browser geladen wird, DANN gibt es keine CSP-Verstöße in der Konsole (Dev und Production), und der Sprachumschalter sowie alle Formulare funktionieren.

### US-11 – Audit-Log
- **AK-11.1:** Folgende Ereignisse werden in der Tabelle `AuditLog` gespeichert, jeweils mit Zeitpunkt, handelndem Nutzer (falls bekannt), betroffenem Nutzer, Ereignistyp, IP-Adresse und Request-ID: Registrierung, Login erfolgreich, Login fehlgeschlagen, Logout, Passwort geändert, Passwort durch Admin zurückgesetzt, Rolle geändert (alt → neu), Admin über `ADMIN_EMAIL` ernannt.
- **AK-11.2:** Das Audit-Log enthält keine Passwörter, Hashes, Session-IDs oder Tokens.
- **AK-11.3:** WENN ein Admin `/admin/audit` aufruft, DANN sieht er die Einträge neueste zuerst, filterbar nach Ereignistyp und Nutzer, seitenweise (50 pro Seite). Einträge sind nicht änderbar oder löschbar.

### Übergreifend
- **AK-12.1:** Alle neuen UI-Texte stehen in `de.json` und `en.json`.
- **AK-12.2:** Alle neuen Seiten sind bei 360 px Breite ohne horizontales Scrollen bedienbar.
- **AK-12.3:** Unit- und API-Tests decken Registrierung, Login/Logout, Session-Ablauf, Rollenprüfung, Rate-Limit, CSRF und Admin-Reset ab; `npm test` bleibt grün.

## Nicht im Umfang

- E-Mail-Bestätigung, Passwort-Reset per Mail (Overview §16)
- Sperren und Entsperren von Nutzern über die UI → Slice 05 (02 legt nur das Feld `blockedAt` an und wertet es aus)
- Konto löschen, Datenexport → Slice 11
- OAuth/Social Login, Zwei-Faktor-Authentifizierung
- Profilseite mit weiteren Angaben, Ändern von E-Mail oder Anzeigename
- Rate-Limits über mehrere Server-Instanzen hinweg (im MVP läuft eine Instanz)

## Entscheidungen

- Erster Admin über `ADMIN_EMAIL` in `.env` (Entscheidung des Nutzers, 2026-10-22).
- Anzeigename ist Pflicht, aber nicht eindeutig; intern zählt die Nutzer-ID.
- Sitzungscookie als Standard, „Angemeldet bleiben“ für 30 Tage (gleitend).
- Admin-Reset erzeugt ein Einmal-Passwort mit Pflichtwechsel beim nächsten Login.
- Passwortregeln nach NIST SP 800-63B: nur Länge (10–128), keine Kompositionsregeln.

## Offene Fragen

- keine
