# Design: 10 – Registrieren verliert das Ziel (`?redirect`)

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-23)**

## Überblick

- `register.vue` leitet nach dem Registrieren wie `login.vue` über `safeRedirect(route.query.redirect, localePath('/'))` weiter.
- Die Querverweise „Registrieren“ (auf `/login`) und „Anmelden“ (auf `/register`) geben ein vorhandenes, sicheres `redirect` weiter.
- `safeRedirect` zieht von `app/composables/useFormErrors.ts` nach `app/utils/redirect.ts` um (weiterhin automatisch importiert), bekommt den Helfer `redirectQuery()` und wird strenger: Auch `/\evil.example` gilt als fremd. Browser lesen `\` in URLs wie `/`, der Pfad wäre also protokollrelativ. Nuxt würde ihn heute als externe URL ablehnen und einen Fehler werfen, statt zur Startseite zu gehen.

```
/zutaten/neu ──(auth-Middleware)──► /login?redirect=/zutaten/neu
                                        │ „Registrieren“
                                        ▼
                                    /register?redirect=/zutaten/neu ──(Absenden)──► /zutaten/neu
```

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `app/utils/redirect.ts` | neu | `safeRedirect` (umgezogen und strenger), `redirectQuery` |
| `app/composables/useFormErrors.ts` | geändert | `safeRedirect` entfernt |
| `app/pages/register.vue` | geändert | Ziel nach dem Registrieren, Link „Anmelden“ mit `redirect` |
| `app/pages/login.vue` | geändert | Link „Registrieren“ mit `redirect` |
| `test/unit/redirect.test.ts` | neu | Fälle für `safeRedirect` und `redirectQuery` |

## Datenmodell

```ts
// app/utils/redirect.ts
/** Nur interne Pfade als Ziel nach Login/Registrierung (kein Open Redirect über ?redirect=//evil oder /\evil). */
export function safeRedirect(target: unknown, fallback: string): string {
  return typeof target === 'string' && target.startsWith('/') && !/^\/[/\\]/.test(target) ? target : fallback
}

/** Query für Querverweise zwischen Login und Registrierung: `redirect` nur, wenn es sicher ist. */
export function redirectQuery(target: unknown): { redirect?: string } {
  const safe = safeRedirect(target, '')
  return safe ? { redirect: safe } : {}
}
```

Einsatz:

```vue
<!-- login.vue -->
<NuxtLink :to="localePath({ path: '/register', query: redirectQuery(route.query.redirect) })">

<!-- register.vue -->
const route = useRoute()
await navigateTo(safeRedirect(route.query.redirect, localePath('/')))
<NuxtLink :to="localePath({ path: '/login', query: redirectQuery(route.query.redirect) })">
```

Das Ziel ist ein schon sprachabhängiger Pfad (z.B. `/en/ingredients/new`), wie ihn die `auth`-Middleware aus `to.fullPath` bildet; er wird nicht erneut durch `localePath` geschickt.

## Tests

**Unit (`test/unit/redirect.test.ts`):**
- `/zutaten/neu`, `/en/ingredients/new?x=1` → unverändert.
- `//evil.example`, `/\evil.example`, `https://evil.example`, `evil`, `''`, `undefined`, `['/a']` (Array aus doppeltem Query-Parameter) → Fallback (AK-1.3).
- `redirectQuery('/a')` → `{ redirect: '/a' }`; `redirectQuery('//evil')` → `{}`.

**Browser (AK-1.4), je auf Deutsch und Englisch:**
1. Als Gast „Zutat anlegen“ öffnen → Login-Seite mit `redirect`.
2. „Registrieren“ → URL `/register?redirect=…` (AK-1.2); „Anmelden“ zurück → `/login?redirect=…`.
3. Registrieren → landet auf „Zutat anlegen“ (AK-1.1).
4. `/register?redirect=//evil.example` und `/register?redirect=/%5Cevil.example` → nach dem Registrieren Startseite (AK-1.3).

## Entscheidungen

- **Nur sichere Ziele weitergeben (`redirectQuery`)** – ein fremdes Ziel wandert nicht durch weitere Links; geprüft wird trotzdem erst beim Weiterleiten. – Verworfen: Rohwert weiterreichen (harmlos, aber unnötig).
- **`safeRedirect` nach `app/utils`** – reine Funktion ohne Bezug zu Formularfehlern, dort unit-testbar ohne Nuxt-Kontext; Aufrufer ändern sich nicht (Auto-Import).
- **Backslash-Fall mitbeheben** – gehört zu AK-1.3 („fremde Seite → Startseite“) und ist eine Zeile.
- **App-Bar-Links „Anmelden“/„Registrieren“ bleiben ohne `redirect`** – dort gibt es kein Ziel; nicht im Befund.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | `register.vue` mit `safeRedirect`; Browser-Schritt 3 |
| AK-1.2 | `redirectQuery` in beiden Querverweisen; Browser-Schritt 2 |
| AK-1.3 | `safeRedirect` (strenger); Unit-Test, Browser-Schritt 4 |
| AK-1.4 | Browser-Prüfung de und en |
