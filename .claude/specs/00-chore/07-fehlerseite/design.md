# Design: 07 – Eigene Fehlerseite und sichtbare Ladefehler

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-23)**

## Überblick

Zwei unabhängige Teile:

1. **`app/error.vue`** ersetzt die Standard-Fehlerseite von Nuxt. Sie rendert im Layout `default` (App-Bar, Navigation, Sprach- und Themenumschalter) und zeigt je nach Status einen übersetzten Titel, einen kurzen Text und zwei Buttons: „Zur Startseite“ und „Zu den Zutaten“. Technische Details (`message`, `stack`, `statusMessage` vom Server) zeigt sie nie.
2. **`LoadError.vue`**: eine kleine Meldung mit „Erneut versuchen“ für Listen, deren `useFetch` fehlschlägt. Sie ersetzt in der Zutatenliste und in den beiden Admin-Tabellen die Liste bzw. Tabelle, solange `error` gesetzt ist.

```
useFetch(...)  ─►  error?  ─ ja ─►  <LoadError @retry="refresh()" />
                     │
                     nein ─►  leer? ─ ja ─► „Keine Zutaten gefunden.“
                                 └ nein ─► Liste / Tabelle
```

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `app/error.vue` | neu | Fehlerseite (404, 500, sonstige) im Layout |
| `app/components/LoadError.vue` | neu | Ladefehler mit „Erneut versuchen“ |
| `app/pages/ingredients/index.vue` | geändert | `error`, `refresh` aus `useFetch`; `LoadError` vor der Leer-Meldung |
| `app/pages/admin/users.vue` | geändert | `LoadError` statt Tabelle bei Fehler |
| `app/pages/admin/audit.vue` | geändert | dito (nur die Hauptliste, siehe Entscheidungen) |
| `app/pages/ingredients/[id]/index.vue`, `edit.vue`, `history.vue` | geändert | `statusMessage` nicht mehr übersetzt mitgeben (die Fehlerseite übersetzt selbst) |
| `i18n/locales/de.json`, `en.json` | geändert | `errorPage.*`, `common.loadError`, `common.retry` |

Liegen bei der Umsetzung die Tee-Listen aus 04 schon vor (`app/pages/teas/index.vue`), bekommen sie `LoadError` genauso.

## UI / Komponenten

### `app/error.vue`

```vue
<script setup lang="ts">
import type { NuxtError } from '#app'
const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()
const localePath = useLocalePath()

const status = computed(() => props.error.statusCode ?? 500)
const kind = computed(() => (status.value === 404 ? 'notFound' : 'generic'))
useHead({ title: () => t(`errorPage.${kind.value}.title`) })

// clearError verlässt den Fehlerzustand und navigiert
const go = (target: string) => clearError({ redirect: target })
</script>

<template>
  <NuxtLayout>
    <!-- Titel, Text, Status klein darunter, zwei Buttons -->
  </NuxtLayout>
</template>
```

- **Titel/Text:** 404 → `errorPage.notFound.*`; alle anderen Status → `errorPage.generic.*`. Der Statuscode steht klein darunter („Fehler 500“), damit Nutzer ihn melden können.
- **Buttons:** `go(localePath('/'))` und `go(localePath({ name: 'ingredients' }))`. `NuxtLink` allein reicht nicht, weil der Fehlerzustand sonst bestehen bliebe.
- **HTTP-Status:** setzt Nuxt beim Server-Rendern aus `statusCode` (404 für unbekannte Seiten und für `createError({ statusCode: 404, fatal: true })` auf den Zutatenseiten).
- **Sprache:** Für `/en/gibt-es-nicht` muss die Seite englisch sein. `@nuxtjs/i18n` erkennt die Sprache aus dem Pfadpräfix auch ohne passende Route; bei der Umsetzung als Erstes prüfen. Falls nicht: In `error.vue` aus `useRequestURL().pathname` (`/en` bzw. `/en/…`) ableiten und `setLocale` vor dem Rendern aufrufen.
- **Breite:** `v-container` aus dem Layout, Buttons in `d-flex flex-wrap ga-2` → bei 360 px untereinander, kein horizontales Scrollen.

Ist die DB weg, scheitert für angemeldete Nutzer schon das Auth-Plugin (siehe README von 00-chore); dann erscheint diese Seite mit dem allgemeinen Text. Das Layout liest nur den bereits geladenen Zustand von `useAuth()` und löst keine eigene Anfrage aus.

### `app/components/LoadError.vue`

```vue
<script setup lang="ts">
defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <v-alert type="error" variant="tonal" :text="t('common.loadError')" class="mb-4">
    <template #append>
      <v-btn variant="text" @click="$emit('retry')">{{ t('common.retry') }}</v-btn>
    </template>
  </v-alert>
</template>
```

Einsatz in der Zutatenliste:

```vue
const { data, pending, error, refresh } = await useFetch(...)

<LoadError v-if="error" @retry="refresh()" />
<p v-else-if="data && !data.items.length">…empty…</p>
<v-list v-else>…</v-list>
<v-pagination v-if="!error && pageCount > 1" … />
```

In den Admin-Seiten: `<LoadError v-if="error" … />` und `<v-data-table-server v-else …>`; Suche und Filter bleiben sichtbar.

## Texte

| Schlüssel | de | en |
|---|---|---|
| `errorPage.notFound.title` | Seite nicht gefunden | Page not found |
| `errorPage.notFound.text` | Diese Adresse gibt es nicht (mehr). | This address does not exist (anymore). |
| `errorPage.generic.title` | Etwas ist schiefgelaufen | Something went wrong |
| `errorPage.generic.text` | Bitte versuche es später noch einmal. | Please try again later. |
| `errorPage.status` | Fehler {status} | Error {status} |
| `errorPage.home` | Zur Startseite | Go to home page |
| `errorPage.ingredients` | Zu den Zutaten | Go to ingredients |
| `common.loadError` | Die Daten konnten nicht geladen werden. | The data could not be loaded. |
| `common.retry` | Erneut versuchen | Try again |

## Prüfung

- `curl -i localhost:3000/gibt-es-nicht` → 404, HTML enthält „Seite nicht gefunden“ und die App-Bar; `/en/does-not-exist` → „Page not found“, Links auf `/` bzw. `/en` und `/en/ingredients`.
- Nicht vorhandene Zutat (`/zutaten/<zufällige UUID>`) → dieselbe Seite, 404.
- 500 beim Rendern: Server mit unerreichbarer `DATABASE_URL`, angemeldet (Auth-Plugin scheitert) → allgemeine Fehlerseite ohne Stacktrace; im Production-Build prüfen, da Nuxt im Dev-Modus Details mitliefert (die Seite zeigt sie trotzdem nicht an).
- Derselbe Server als Gast: `/zutaten` → `LoadError`; „Erneut versuchen“ nach Start der DB lädt die Liste. Admin-Listen analog (DB nach dem Login stoppen).
- Playwright bei 360 px: `document.documentElement.scrollWidth <= 360`; `securitypolicyviolation`-Listener ohne Treffer (außer dem bekannten zod-Eval, falls 08 noch nicht umgesetzt ist).

## Entscheidungen

- **`error.vue` mit `<NuxtLayout>`** – gleiche App-Bar wie überall, ohne das Layout zu duplizieren. – Verworfen: eigene, schlanke Fehlerseite ohne Layout (verfehlt AK-1.1).
- **Nur zwei Titel (404 und allgemein)** – mehr Unterscheidungen (401, 403) kommen auf Seiten kaum vor: die Middleware leitet vorher um. – Verworfen: Text vom Server (`statusMessage`) anzeigen; könnte technische Details enthalten (AK-1.2).
- **Links zur Startseite und zu den Zutaten, keine Suche** – Entscheidung vom 2026-10-23.
- **`LoadError` als Komponente** – drei (mit Tees vier) Listen brauchen dasselbe. – Verworfen: Ladefehler als Snackbar (verschwindet und lässt eine scheinbar leere Liste zurück).
- **Audit-Seite: nur die Hauptliste** – die Nutzerauswahl im Filter (`userOptions`) ist Zusatz; schlägt sie fehl, bleibt der Filter leer, die Liste funktioniert.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | `app/error.vue` (404-Texte, Layout, zwei Links, Sprache); `curl`- und Browser-Prüfung de/en |
| AK-1.2 | `app/error.vue` (allgemeiner Text, keine Details); Prüfung mit unerreichbarer DB |
| AK-1.3 | `LoadError.vue`, `ingredients/index.vue` (`error` vor Leer-Meldung) |
| AK-1.4 | `admin/users.vue`, `admin/audit.vue` |
| AK-1.5 | Texte in beiden Sprachdateien (i18n-Test), 360-px- und CSP-Prüfung |
