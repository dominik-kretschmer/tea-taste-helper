<script setup lang="ts">
// Versionsliste der Historie (Zutaten und Tees) mit Auswahl für den Vergleich.
defineProps<{
  revisions: Page<RevisionEntry> | null | undefined
  canCompare: boolean
}>()

const compareFrom = defineModel<number>('from', { required: true })
const compareTo = defineModel<number>('to', { required: true })
const page = defineModel<number>('page', { required: true })

const { t, locale } = useI18n()
</script>

<template>
  <div class="revisions mb-2" role="list">
    <div v-if="canCompare" class="revision revision-head text-caption text-medium-emphasis">
      <span>{{ t('catalog.historyPage.from') }}</span>
      <span>{{ t('catalog.historyPage.to') }}</span>
    </div>
    <div v-for="entry in revisions?.items ?? []" :key="entry.version" class="revision" role="listitem">
      <!-- Eigene Zellen: Vuetify setzt an .v-selection-control `grid-area: control` -->
      <template v-if="canCompare">
        <div>
          <v-radio
            v-model="compareFrom"
            :value="entry.version"
            :aria-label="`${t('catalog.historyPage.from')} ${t('catalog.historyPage.version', { version: entry.version })}`"
            density="compact"
          />
        </div>
        <div>
          <v-radio
            v-model="compareTo"
            :value="entry.version"
            :aria-label="`${t('catalog.historyPage.to')} ${t('catalog.historyPage.version', { version: entry.version })}`"
            density="compact"
          />
        </div>
      </template>
      <div class="py-2">
        <div class="font-weight-medium">
          {{ t('catalog.historyPage.version', { version: entry.version }) }}
          <v-chip v-if="entry.isCurrent" size="x-small" color="primary" class="ml-1">
            {{ t('catalog.historyPage.current') }}
          </v-chip>
        </div>
        <div class="text-body-2 text-medium-emphasis">
          {{ formatDateTime(entry.createdAt, locale) }} · {{ entry.author?.displayName ?? t('catalog.deletedAccount') }}
        </div>
        <div class="text-body-2 text-break">
          {{ entry.note ?? t('catalog.historyPage.noNote') }}
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
