<script setup lang="ts">
import { mdiArrowLeft } from '@mdi/js'

const { t } = useI18n()
const { loggedIn } = useAuth()
const localePath = useLocalePath()
const route = useRoute()

const id = computed(() => String(route.params.id))
const page = ref(1)
const [{ data: detail, error, refresh: refreshDetail }, { data: revisions, refresh: refreshRevisions }] = await Promise.all([
  // ?merged=1: Die Historie bleibt auch nach dem Zusammenführen lesbar (05 AK-4.2)
  useFetch<{ tea: TeaDetail }>(() => `/api/teas/${id.value}`, { query: { merged: 1 } }),
  useFetch<RevisionPage>(() => `/api/teas/${id.value}/revisions`, { query: { page } }),
])
if (error.value) {
  const statusCode = error.value.statusCode ?? 500
  // Titel und Text übersetzt die Fehlerseite selbst (app/error.vue)
  throw createError({ statusCode, fatal: true })
}

const text = useCatalogText(() => detail.value?.tea)
useHead({ title: () => t('teas.historyPage.title', { name: text.value?.text.name ?? '' }) })

// Standard: neueste gegen vorletzte Version (AK-6.1)
const latest = detail.value!.tea.version
const compareTo = ref(latest)
const compareFrom = ref(Math.max(1, latest - 1))
const canCompare = ref(latest > 1)

const mergedInto = computed(() => detail.value?.tea.mergedInto ?? null)
// Zurücksetzen nur für Angemeldete und aktive Einträge; private Tees sieht ohnehin nur der Ersteller (05 AK-1.2, AK-1.6)
const canRevert = computed(() => loggedIn.value && !mergedInto.value && !detail.value?.tea.moderation)
const revertMessage = ref<string | null>(null)

async function onReverted(result: { changed: boolean, version: number }) {
  revertMessage.value = result.changed
    ? t('moderation.revert.done', { version: result.version })
    : t('moderation.revert.noChanges', { version: result.version })
  await reload()
  compareTo.value = result.version
  compareFrom.value = Math.max(1, result.version - 1)
  canCompare.value = result.version > 1
}

async function reload() {
  await Promise.all([refreshDetail(), refreshRevisions()])
}

const { data: comparison, pending: comparing } = await useFetch<{
  changes: TeaChange[]
  ingredients: Record<string, { sourceLocale: ContentLocale, translations: CatalogTranslations }>
}>(
  () => `/api/teas/${id.value}/compare`,
  { query: { from: compareFrom, to: compareTo }, immediate: canCompare.value },
)
</script>

<template>
  <v-row justify="center">
    <v-col cols="12" md="10" lg="8">
      <v-btn variant="text" :prepend-icon="mdiArrowLeft" class="mb-2 ml-n4" :to="localePath({ name: 'teas-id', params: { id } })">
        {{ t('teas.historyPage.back') }}
      </v-btn>
      <h1 class="text-h4 mb-6 text-break">
        {{ t('teas.historyPage.title', { name: text?.text.name ?? '' }) }}
      </h1>

      <v-alert v-if="mergedInto" type="info" variant="tonal" density="compact" class="mb-4">
        {{ t('moderation.merge.mergedInto') }}
        <NuxtLink :to="localePath({ name: 'teas-id', params: { id: mergedInto } })" class="d-block">
          {{ t('moderation.merge.openTarget') }}
        </NuxtLink>
      </v-alert>

      <CatalogRevisionList
        v-model:from="compareFrom"
        v-model:to="compareTo"
        v-model:page="page"
        :revisions="revisions"
        :can-compare="canCompare"
        entity-type="tea"
        :entity-id="id"
        :can-revert="canRevert"
        @reverted="onReverted"
        @reload="reload"
      />
      <v-snackbar :model-value="!!revertMessage" color="success" :text="revertMessage ?? ''" @update:model-value="revertMessage = null" />

      <template v-if="canCompare">
        <h2 class="text-h6 mt-6 mb-2">
          {{ t('catalog.historyPage.compare', { from: compareFrom, to: compareTo }) }}
        </h2>
        <v-progress-linear v-if="comparing" indeterminate class="mb-2" />
        <TeaRevisionDiff v-if="comparison?.changes.length" :changes="comparison.changes" :ingredients="comparison.ingredients" />
        <p v-else-if="comparison" class="text-body-1 text-medium-emphasis">
          {{ t('catalog.historyPage.noChanges') }}
        </p>
      </template>
    </v-col>
  </v-row>
</template>
