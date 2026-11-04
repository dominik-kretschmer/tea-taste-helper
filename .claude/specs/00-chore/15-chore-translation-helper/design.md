# Design: 15 – Translation-Helper zentralisieren

> Phase 2 zu [requirements.md](requirements.md). Status: **Entwurf (2026-10-24)**

## Überblick

Zwei Funktionen in `server/utils/catalog.ts`, Abschnitt nach `lockName`:

```ts
/** Übersetzungs-Zeilen einer Version als Map je Sprache. */
export function toTranslations(rows: { locale: string, name: string, description: string | null }[]): CatalogTranslations {
  const translations: CatalogTranslations = {}
  for (const row of rows) translations[row.locale as ContentLocale] = { name: row.name, description: row.description }
  return translations
}

/** Umkehrung für `translations.create`: eine Zeile je vorhandener Sprache, mit Vergleichsschlüssel. */
export function translationRows(translations: CatalogTranslations) {
  return CONTENT_LOCALES.flatMap((locale) => {
    const text = translations[locale]
    return text ? [{ locale, name: text.name, nameKey: normalizeName(text.name), description: text.description }] : []
  })
}
```

Der Parametertyp von `toTranslations` ist strukturell und passt damit auf `IngredientVersionTranslation` und `TeaVersionTranslation`. Den Rückgabetyp von `translationRows` leitet TypeScript ab. Er passt auf beide `create`-Eingaben, wie heute der Inline-Code.

Aufrufer danach:

```ts
// ingredients.ts toSnapshot, teas.ts toTeaSnapshot
translations: toTranslations(version.translations),
// ingredients.ts loadIngredientViews, moderation.ts loadEntryInfos
const translations = toTranslations(version.translations)
// ingredients.ts writeIngredientVersion, teas.ts writeTeaVersion
translations: { create: translationRows(snapshot.translations) },
```

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|-------|--------------|-------|
| `server/utils/catalog.ts` | geändert | `toTranslations`, `translationRows` |
| `server/utils/ingredients.ts` | geändert | 3 Stellen |
| `server/utils/teas.ts` | geändert | 2 Stellen |
| `server/utils/moderation.ts` | geändert | 1 Stelle |

## Entscheidungen

- **`server/utils/catalog.ts` statt `shared/utils/catalog.ts`** – beide Funktionen arbeiten mit DB-Zeilen, und die Datei sammelt laut Kopfkommentar die „gemeinsamen Server-Bausteine für Katalog-Einträge“. `normalizeName` aus `shared/utils` ist dort per Auto-Import verfügbar. – Verworfen: `shared/utils/catalog.ts`. Das wäre per Unit-Test leichter testbar, landet aber im Client-Auto-Import.
- **Kein eigener Unit-Test** – reine Verschiebung ohne neue Logik. Alle sechs Stellen laufen durch bestehende API-Tests (Zutaten und Tees anlegen und lesen, Moderationsliste). `server/utils` lässt sich wegen der Nitro-Auto-Imports außerdem nicht ohne Weiteres per Unit-Test laden.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|--------------------|-----------------|
| AK-1.1 | `server/utils/catalog.ts` |
| AK-1.2 | sechs Aufrufer umgestellt; beide `grep` aus den Anforderungen |
| AK-1.3 | Code von `translationRows` ist der bisherige Inline-Code; API-Tests zu Duplikatregel und Übersetzungen (`ingredients.test.ts`, `teas.test.ts`) |
| AK-1.4 | Abschluss-Prüfung |
