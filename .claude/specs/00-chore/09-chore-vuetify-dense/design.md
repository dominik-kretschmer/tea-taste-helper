# Design: 09 – Veraltetes `dense` in IngredientForm

> Phase 2 zu [requirements.md](requirements.md). Status: **freigegeben (2026-10-23)**, umgesetzt mit `04-tees` (siehe requirements.md)

## Überblick

`<v-row dense>` wird zu `<v-row density="compact">`, wie es die Vuetify-Warnung vorschlägt und wie es in 02 an anderer Stelle schon gemacht wurde. Beide Varianten setzen denselben kleineren Spaltenabstand; sichtbar ändert sich nichts.

Aktuell steht die Stelle in `app/components/ingredient/IngredientForm.vue:107`. 04-Tees zieht Teile des Formulars nach `app/components/catalog/BrewFields.vue` bzw. `TranslationFields.vue` um. Geändert wird die Stelle dort, wo sie zum Zeitpunkt der Umsetzung liegt; maßgeblich ist die Suche aus AK-1.2.

## Betroffene Dateien

| Datei | Neu/Geändert | Zweck |
|---|---|---|
| `app/components/ingredient/IngredientForm.vue` (oder nach 04 `app/components/catalog/*.vue`) | geändert | `dense` → `density="compact"` |

Kein Datenmodell, keine API.

## Prüfung

- `grep -rnw dense app/ | grep -v density` → keine Treffer (AK-1.2).
- `/zutaten/neu` und `/zutaten/<id>/bearbeiten` im Browser: Konsole ohne „[Vuetify UPGRADE]“ (AK-1.1).
- Screenshot vorher/nachher bei 360 px und 1280 px, Abstände gleich (AK-1.3).

## Entscheidungen

- **`density="compact"` statt Abstände per Klasse** – offizieller Ersatz, gleiche Optik. – Verworfen: `no-gutters` (anderer Abstand).
- **Keine ESLint-Regel** – eine einzelne Stelle; die Konsolenprüfung in den Abnahmen fängt neue Fälle.

## Abdeckung

| Akzeptanzkriterium | Umgesetzt durch |
|---|---|
| AK-1.1 | `density="compact"`; Konsolenprüfung |
| AK-1.2 | `grep` über `app/` |
| AK-1.3 | Screenshot-Vergleich |
