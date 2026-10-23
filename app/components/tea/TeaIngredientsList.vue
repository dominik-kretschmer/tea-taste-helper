<script setup lang="ts">
// Zutaten eines Tees in ihrer Reihenfolge mit Anteil; dazu der unbekannte Rest (AK-0.3, AK-1.5).
const props = defineProps<{ ingredients: TeaIngredientView[] }>()

const { t, locale } = useI18n()
const localePath = useLocalePath()

const rows = computed(() => props.ingredients.map(item => ({
  ...item,
  text: pickTranslation(item, locale.value as ContentLocale),
})))

// Den Rest nur zeigen, wenn überhaupt Anteile angegeben sind – sonst wäre „100 % unbekannt“ nur Rauschen
const rest = computed(() => (props.ingredients.some(item => item.percent !== null) ? remainingPercent(props.ingredients) : 0))
</script>

<template>
  <v-list density="compact" class="py-0" :aria-label="t('teas.fields.ingredients')">
    <v-list-item
      v-for="row in rows"
      :key="row.ingredientId"
      :to="localePath({ name: 'ingredients-id', params: { id: row.ingredientId } })"
      class="px-0"
    >
      <v-list-item-title class="text-wrap" :lang="row.text.locale">
        {{ row.text.text.name }}
      </v-list-item-title>
      <template #append>
        <span class="text-body-2" :class="{ 'text-medium-emphasis': row.percent === null }">
          {{ row.percent === null ? t('teas.ingredients.noPercent') : t('teas.diff.percent', { percent: row.percent }) }}
        </span>
      </template>
    </v-list-item>
    <v-list-item v-if="rest > 0" class="px-0">
      <v-list-item-subtitle>{{ t('teas.ingredients.rest', { rest }) }}</v-list-item-subtitle>
    </v-list-item>
  </v-list>
</template>
