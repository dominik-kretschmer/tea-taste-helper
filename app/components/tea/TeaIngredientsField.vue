<script setup lang="ts">
import { mdiArrowDown, mdiArrowUp, mdiClose, mdiMagnify, mdiPlus } from '@mdi/js'

// Zutaten eines Tees: suchen und hinzufügen, Reihenfolge per Hoch/Runter (tastaturbedienbar),
// optionaler Anteil je Zutat, darunter Summe und unbekannter Rest (AK-0.1, AK-0.3, AK-2.2).
const props = defineProps<{ fieldErrors: Record<string, string> }>()
const emit = defineEmits<{ missing: [] }>()
const items = defineModel<TeaFormIngredient[]>({ required: true })

const { t, locale } = useI18n()

const search = ref('')
const results = ref<{ id: string, name: string }[]>([])
const searching = ref(false)
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(debounce)
  const q = (value ?? '').trim()
  if (!q) {
    results.value = []
    return
  }
  debounce = setTimeout(async () => {
    searching.value = true
    try {
      const page = await $fetch<Page<IngredientListItem>>('/api/ingredients', { query: { q, locale: locale.value } })
      results.value = page.items.map(item => ({ id: item.id, name: item.name }))
    }
    catch {
      results.value = []
    }
    finally {
      searching.value = false
    }
  }, 300)
})

const chosen = computed(() => new Set(items.value.map(item => item.ingredientId)))
// Bereits gewählte Zutaten bleiben sichtbar, aber ausgegraut
const options = computed(() => results.value.map(item => ({ ...item, props: { disabled: chosen.value.has(item.id) } })))

function add(option: { id: string, name: string } | null) {
  if (!option || chosen.value.has(option.id)) return
  items.value = [...items.value, { ingredientId: option.id, name: option.name, percent: '' }]
  search.value = ''
  results.value = []
}

function move(index: number, by: -1 | 1) {
  const next = [...items.value]
  const [item] = next.splice(index, 1)
  next.splice(index + by, 0, item!)
  items.value = next
}

function remove(index: number) {
  items.value = items.value.filter((_, i) => i !== index)
}

// Angegebene Anteile (leere und unlesbare zählen nicht)
const given = computed(() => items.value
  .map(item => String(item.percent ?? '').trim())
  .filter(value => value !== '' && !Number.isNaN(Number(value)))
  .map(Number))
const sum = computed(() => given.value.reduce((total, value) => total + value, 0))
const rest = computed(() => 100 - sum.value)
</script>

<template>
  <div>
    <p class="text-subtitle-2 mb-2">
      {{ t('teas.fields.ingredients') }}
    </p>

    <v-autocomplete
      v-model:search="search"
      :model-value="null"
      :items="options"
      item-title="name"
      item-value="id"
      return-object
      no-filter
      hide-no-data
      :loading="searching"
      :label="t('teas.ingredients.search')"
      :prepend-inner-icon="mdiMagnify"
      :error-messages="props.fieldErrors.ingredients"
      @update:model-value="add"
    />

    <p v-if="!items.length" class="text-body-2 text-medium-emphasis mb-2">
      {{ t('teas.ingredients.empty') }}
    </p>

    <div v-for="(item, index) in items" :key="item.ingredientId" class="ingredient-row" role="group" :aria-label="item.name">
      <span class="text-body-1 text-break">{{ item.name }}</span>
      <v-text-field
        v-model="item.percent"
        :label="t('teas.fields.percent')"
        :placeholder="t('teas.ingredients.noPercent')"
        type="number"
        inputmode="numeric"
        density="compact"
        class="percent"
        :hide-details="!props.fieldErrors[`ingredients.${index}.percent`]"
        :error-messages="props.fieldErrors[`ingredients.${index}.percent`]"
      />
      <div class="d-flex">
        <v-btn :icon="mdiArrowUp" variant="text" size="small" :disabled="index === 0" :aria-label="t('teas.ingredients.moveUp', { name: item.name })" @click="move(index, -1)" />
        <v-btn :icon="mdiArrowDown" variant="text" size="small" :disabled="index === items.length - 1" :aria-label="t('teas.ingredients.moveDown', { name: item.name })" @click="move(index, 1)" />
        <v-btn :icon="mdiClose" variant="text" size="small" :aria-label="t('teas.ingredients.remove', { name: item.name })" @click="remove(index)" />
      </div>
    </div>

    <p v-if="given.length" class="text-body-2 mt-2" :class="{ 'text-error': sum > 100 }">
      {{ t('teas.ingredients.sum', { sum }) }}
      <template v-if="rest > 0">
        · {{ t('teas.ingredients.rest', { rest }) }}
      </template>
    </p>

    <v-btn variant="text" size="small" :prepend-icon="mdiPlus" class="mt-1 px-0" @click="emit('missing')">
      {{ t('teas.ingredients.missing') }}
    </v-btn>
  </div>
</template>

<style scoped>
.ingredient-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 7.5rem auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  border-bottom: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}
@media (max-width: 599.98px) {
  .ingredient-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .ingredient-row .percent {
    grid-column: 1;
    grid-row: 2;
  }
}
</style>
