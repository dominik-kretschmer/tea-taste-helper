<script setup lang="ts">
// Vergleich zweier Tee-Versionen: Felder wie bei Zutaten, dazu die Zutatenliste als
// „+ Minze 20 %“, „− Zimt“, „Grüntee: 60 % → 70 %“, „Minze: Position 2 → 1“ (AK-6.1).
const props = defineProps<{
  changes: TeaChange[]
  /** Namen aller Zutaten beider Stände (aus der Vergleichs-API) */
  ingredients: Record<string, { sourceLocale: ContentLocale, translations: CatalogTranslations }>
}>()

const { t, locale } = useI18n()

type IngredientChange = Extract<TeaChange, { field: 'ingredient' }>
const isIngredientChange = (change: TeaChange): change is IngredientChange => change.field === 'ingredient'

const fieldChanges = computed(() => props.changes.filter(change => !isIngredientChange(change)) as Exclude<TeaChange, IngredientChange>[])

const percentText = (percent: number | null) => (percent === null ? t('teas.ingredients.noPercent') : t('teas.diff.percent', { percent }))

const ingredientLines = computed(() => props.changes.filter(isIngredientChange).map((change) => {
  const entry = props.ingredients[change.ingredientId]
  const name = entry ? pickTranslation(entry, locale.value as ContentLocale).text.name : '?'
  if (!change.from) return { kind: 'added', text: `${t('teas.diff.added', { name })} (${percentText(change.to!.percent)})` }
  if (!change.to) return { kind: 'removed', text: t('teas.diff.removed', { name }) }
  const parts: string[] = []
  if (change.from.percent !== change.to.percent) parts.push(`${percentText(change.from.percent)} → ${percentText(change.to.percent)}`)
  if (change.from.position !== change.to.position) {
    parts.push(`${t('teas.diff.position', { position: change.from.position + 1 })} → ${change.to.position + 1}`)
  }
  return { kind: 'changed', text: `${name}: ${parts.join(', ')}` }
}))
</script>

<template>
  <div>
    <CatalogRevisionDiff v-if="fieldChanges.length" :changes="fieldChanges" class="mb-4" />
    <template v-if="ingredientLines.length">
      <p class="text-subtitle-2 mb-1">
        {{ t('catalog.diffFields.ingredient') }}
      </p>
      <ul class="ingredient-changes">
        <!-- Nur Text-Interpolation (AK-10.2) -->
        <li v-for="(line, index) in ingredientLines" :key="index" :class="line.kind">
          {{ line.text }}
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.ingredient-changes {
  list-style: none;
  padding: 0;
}
.ingredient-changes li {
  padding: 0.25rem 0;
  overflow-wrap: anywhere;
  border-bottom: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.added {
  color: rgb(var(--v-theme-success));
}
.removed {
  color: rgb(var(--v-theme-error));
}
</style>
