<script setup lang="ts">
import { mdiArrowLeft } from '@mdi/js'

const { t, locale } = useI18n()
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
  throw createError({ statusCode, statusMessage: statusCode === 404 ? t('errors.NOT_FOUND') : error.value.statusMessage, fatal: true })
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

      <div class="revisions mb-2" role="list">
        <div v-if="canCompare" class="revision revision-head text-caption text-medium-emphasis">
          <span>{{ t('ingredients.historyPage.from') }}</span>
          <span>{{ t('ingredients.historyPage.to') }}</span>
        </div>
        <div v-for="entry in revisions?.items ?? []" :key="entry.version" class="revision" role="listitem">
          <!-- Eigene Zellen: Vuetify setzt an .v-selection-control `grid-area: control` -->
          <template v-if="canCompare">
            <div>
              <v-radio
                v-model="compareFrom"
                :value="entry.version"
                :aria-label="`${t('ingredients.historyPage.from')} ${t('ingredients.historyPage.version', { version: entry.version })}`"
                density="compact"
              />
            </div>
            <div>
              <v-radio
                v-model="compareTo"
                :value="entry.version"
                :aria-label="`${t('ingredients.historyPage.to')} ${t('ingredients.historyPage.version', { version: entry.version })}`"
                density="compact"
              />
            </div>
          </template>
          <div class="py-2">
            <div class="font-weight-medium">
              {{ t('ingredients.historyPage.version', { version: entry.version }) }}
              <v-chip v-if="entry.isCurrent" size="x-small" color="primary" class="ml-1">
                {{ t('ingredients.historyPage.current') }}
              </v-chip>
            </div>
            <div class="text-body-2 text-medium-emphasis">
              {{ formatDateTime(entry.createdAt, locale) }} · {{ entry.author?.displayName ?? t('ingredients.deletedAccount') }}
            </div>
            <div class="text-body-2 text-break">
              {{ entry.note ?? t('ingredients.historyPage.noNote') }}
            </div>
          </div>
        </div>
      </div>

      <v-pagination
        v-if="revisions && revisions.total > revisions.pageSize"
        v-model="page"
        :length="Math.ceil(revisions.total / revisions.pageSize)"
        density="comfortable"
        class="mb-4"
      />

      <template v-if="canCompare">
        <h2 class="text-h6 mt-6 mb-2">
          {{ t('ingredients.historyPage.compare', { from: compareFrom, to: compareTo }) }}
        </h2>
        <v-progress-linear v-if="comparing" indeterminate class="mb-2" />
        <IngredientRevisionDiff v-if="comparison?.changes.length" :changes="comparison.changes" />
        <p v-else-if="comparison" class="text-body-1 text-medium-emphasis">
          {{ t('ingredients.historyPage.noChanges') }}
        </p>
      </template>
    </v-col>
  </v-row>
</template>

<style scoped>
.revision {
  display: grid;
  grid-template-columns: 40px 40px minmax(0, 1fr);
  align-items: center;
  column-gap: 0.5rem;
  border-bottom: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.revision > :only-child {
  grid-column: 1 / -1;
}
.revision-head {
  border-bottom: none;
}
.revision-head > span {
  text-align: center;
}
</style>
