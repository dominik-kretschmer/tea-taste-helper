# 10 – Registrieren verliert das Ziel (`?redirect`)

> Chore-Issue zu [00-chore](../README.md). Phase 1: Anforderungen. Status: **Entwurf – wartet auf Freigabe**

## Befund

- Geschützte Seiten (z.B. „Zutat anlegen“) leiten Gäste nach `/login?redirect=/zutaten/neu`. Nach dem Anmelden geht es zurück, das funktioniert.
- Der Link „Noch kein Konto? Registrieren“ auf der Login-Seite gibt `redirect` nicht weiter, und `app/pages/register.vue` leitet nach dem Registrieren immer zur Startseite. Ein neuer Nutzer, der eine Zutat anlegen wollte, landet also auf der Startseite.
- Umgekehrt gibt „Schon registriert? Anmelden“ das Ziel ebenfalls nicht weiter.

## Ziel

Wer sich auf dem Weg zu einer geschützten Seite registriert, landet danach dort.

## User Stories

- **US-1:** Als neuer Besucher, der eine Zutat anlegen will, möchte ich nach dem Registrieren direkt auf „Zutat anlegen“ landen.

## Akzeptanzkriterien

- **AK-1.1:** WENN `/register?redirect=/zutaten/neu` erfolgreich abgeschickt wird, DANN landet der neue Nutzer auf `/zutaten/neu`.
- **AK-1.2:** WENN auf `/login?redirect=X` „Registrieren“ geklickt wird, DANN führt der Link zu `/register?redirect=X` (und umgekehrt).
- **AK-1.3:** WENN `redirect` auf eine fremde Seite zeigt (z.B. `//evil.example`), DANN geht es wie beim Login zur Startseite (`safeRedirect`).
- **AK-1.4:** Die Prüfung erfolgt im Browser auf Deutsch und Englisch.

## Nicht im Umfang

- keine

## Offene Fragen

- keine
