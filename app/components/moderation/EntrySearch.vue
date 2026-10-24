<script setup lang="ts">
// Suche nach einer Zutat bzw. einem öffentlichen Tee (Duplikat-Original beim Melden, Ziel beim Zusammenführen, Vorrat)
const props = defineProps<{
  entityType: CatalogTypeValue
  /** dieser Eintrag erscheint nicht in den Treffern */
  exclude?: string
  label?: string
  errorMessages?: string
  /** auch eigene private Tees (Vorrat, 06 AK-2.1) */
  withOwn?: boolean
}>()
const model = defineModel<string | null>({ default: null })

const { t, locale } = useI18n()
const search = ref('')
const items = ref<{ id: string, name: string }[]>([])
const loading = ref(false)
let debounce: ReturnType<typeof setTimeout> | undefined

watch(search, (value) => {
  clearTimeout(debounce)
  const q = value?.trim()
  if (!q || items.value.some(item => item.name === q)) return
  debounce = setTimeout(async () => {
    loading.value = true
    try {
      const path = props.entityType === 'ingredient' ? '/api/ingredients' : '/api/teas'
      const page = await $fetch<Page<{ id: string, name: string }>>(path, { query: { q, locale: locale.value, ...(props.withOwn ? { withOwn: 'true' } : {}) } })
      items.value = page.items.filter(item => item.id !== props.exclude)
    }
    finally {
      loading.value = false
    }
  }, 300)
})
</script>

<template>
  <v-autocomplete
    v-model="model"
    v-model:search="search"
    :items="items"
    item-title="name"
    item-value="id"
    :label="label ?? t('moderation.search.label')"
    :loading="loading"
    :no-data-text="t('moderation.search.noResults')"
    :error-messages="errorMessages"
    no-filter
    clearable
  />
</template>
