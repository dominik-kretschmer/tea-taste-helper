# 09 – Veraltetes `dense` in IngredientForm

> Chore-Issue zu [00-chore](../README.md). Phase 1: Anforderungen. Status: **erledigt (2026-10-23)** mit `04-tees`, Aufgabe 2 – `<v-row dense>` ist beim Herauslösen von `BrewFields` durch `density="compact"` ersetzt worden, die Warnung tritt nicht mehr auf

## Befund

`app/components/ingredient/IngredientForm.vue` nutzt `<v-row dense>`. Vuetify 4 meldet beim Anlegen und Bearbeiten: „[Vuetify UPGRADE] 'dense' is deprecated, use 'density="compact"' instead“. In 02 wurde dasselbe schon an anderer Stelle behoben.

## Ziel

Keine Vuetify-Upgrade-Warnungen in der Konsole.

## Akzeptanzkriterien

- **AK-1.1:** WENN `/zutaten/neu` oder `/zutaten/<id>/bearbeiten` geladen wird, DANN gibt es keine Warnung „[Vuetify UPGRADE]“.
- **AK-1.2:** Im Projekt kommt `dense` als Vuetify-Prop nicht mehr vor (Suche über `app/`).
- **AK-1.3:** Die Abstände im Formular bleiben sichtbar gleich.

## Nicht im Umfang

- keine

## Offene Fragen

- keine
