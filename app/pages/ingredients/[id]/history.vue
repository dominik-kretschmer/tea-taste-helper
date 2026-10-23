<script setup lang="ts">
import { mdiArrowLeft } from '@mdi/js'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const id = computed(() => String(route.params.id))
const page = ref(1)
const [{ data: detail, error }, { data: revisions }] = await Promise.all([
  useFetch<{ ingredient: IngredientDetail }>(() => `/api/ingredients/${id.value}`),
  useFetch<Page<RevisionEntry>>(() => `/api/ingredients/${id.value}/revisions`, { query: { page } }),
])
if (error.value) {
  const statusCode = error.value.statusCode ?? 500
  // Titel und Text übersetzt die Fehlerseite selbst (app/error.vue)
  throw createError({ statusCode, fatal: true })
}

const text = useIngredientText(() => detail.value?.ingredient)
useHead({ title: () => t('ingredients.historyPage.title', { name: text.value?.text.name ?? '' }) })

// Standard: neueste gegen vorletzte Version (AK-5.2)
const latest = detail.value!.ingredient.version
const compareTo = ref(latest)
const compareFrom = ref(Math.max(1, latest - 1))
const canCompare = latest > 1

const { data: comparison, pending: comparing } = await useFetch<{ changes: SnapshotChange[] }>(
  () => `/api/ingredients/${id.value}/compare`,
  { query: { from: compareFrom, to: compareTo }, immediate: canCompare },
)
</script>

<template>
  <v-row justify="center">
    <v-col cols="12" md="10" lg="8">
      <v-btn variant="text" :prepend-icon="mdiArrowLeft" class="mb-2 ml-n4" :to="localePath({ name: 'ingredients-id', params: { id } })">
        {{ t('ingredients.historyPage.back') }}
      </v-btn>
      <h1 class="text-h4 mb-6 text-break">
        {{ t('ingredients.historyPage.title', { name: text?.text.name ?? '' }) }}
      </h1>

      <CatalogRevisionList
        v-model:from="compareFrom"
        v-model:to="compareTo"
        v-model:page="page"
        :revisions="revisions"
        :can-compare="canCompare"
      />

      <template v-if="canCompare">
        <h2 class="text-h6 mt-6 mb-2">
          {{ t('catalog.historyPage.compare', { from: compareFrom, to: compareTo }) }}
        </h2>
        <v-progress-linear v-if="comparing" indeterminate class="mb-2" />
        <CatalogRevisionDiff v-if="comparison?.changes.length" :changes="comparison.changes" />
        <p v-else-if="comparison" class="text-body-1 text-medium-emphasis">
          {{ t('catalog.historyPage.noChanges') }}
        </p>
      </template>
    </v-col>
  </v-row>
</template>
