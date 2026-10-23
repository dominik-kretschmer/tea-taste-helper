<script setup lang="ts">
import { mdiBackupRestore } from '@mdi/js'

// Versionsliste der Historie (Zutaten und Tees) mit Auswahl für den Vergleich, Ereignissen ohne Version
// (Ausblenden, Wiederherstellen, Zusammenführen) und Zurücksetzen (05 AK-1.1, AK-5.6)
const props = defineProps<{
  revisions: RevisionPage | null | undefined
  canCompare: boolean
  entityType: CatalogTypeValue
  entityId: string
  /** angemeldet, Eintrag aktiv und (bei privaten Tees) eigener */
  canRevert: boolean
}>()
const emit = defineEmits<{ reverted: [result: { changed: boolean, version: number }], reload: [] }>()

const compareFrom = defineModel<number>('from', { required: true })
const compareTo = defineModel<number>('to', { required: true })
const page = defineModel<number>('page', { required: true })

const { t, locale } = useI18n()
const localePath = useLocalePath()

const current = computed(() => props.revisions?.items.find(entry => entry.isCurrent)?.version ?? 0)
const revertTarget = ref<number | null>(null)
const revertOpen = computed({ get: () => revertTarget.value !== null, set: (value) => { if (!value) revertTarget.value = null } })

type Row = { kind: 'version', entry: RevisionEntry } | { kind: 'event', event: CatalogEventEntry }

/** Ereignisse zeitlich zwischen die Versionen dieser Seite einsortieren */
const rows = computed<Row[]>(() => {
  const items = props.revisions?.items ?? []
  if (!props.revisions || !items.length) return []
  const newest = items[0]!.createdAt
  const oldest = items[items.length - 1]!.createdAt
  const firstPage = props.revisions.page === 1
  const lastPage = props.revisions.page * props.revisions.pageSize >= props.revisions.total
  const events = props.revisions.events.filter(event => (firstPage || event.createdAt <= newest) && (lastPage || event.createdAt >= oldest))
  return [
    ...items.map(entry => ({ kind: 'version' as const, entry, at: entry.createdAt })),
    ...events.map(event => ({ kind: 'event' as const, event, at: event.createdAt })),
  ].sort((a, b) => b.at.localeCompare(a.at))
})

const eventReason = (event: CatalogEventEntry) => (event.reason === BULK_REVERT_REASON ? t('moderation.hidden.bulkReason') : event.reason)
</script>

<template>
  <div class="revisions mb-2" role="list">
    <div v-if="canCompare" class="revision revision-head text-caption text-medium-emphasis">
      <span>{{ t('catalog.historyPage.from') }}</span>
      <span>{{ t('catalog.historyPage.to') }}</span>
    </div>
    <template v-for="row in rows" :key="row.kind === 'version' ? `v${row.entry.version}` : `e${row.event.createdAt}${row.event.kind}`">
      <div v-if="row.kind === 'version'" class="revision" role="listitem">
        <!-- Eigene Zellen: Vuetify setzt an .v-selection-control `grid-area: control` -->
        <template v-if="canCompare">
          <div>
            <v-radio
              v-model="compareFrom"
              :value="row.entry.version"
              :aria-label="`${t('catalog.historyPage.from')} ${t('catalog.historyPage.version', { version: row.entry.version })}`"
              density="compact"
            />
          </div>
          <div>
            <v-radio
              v-model="compareTo"
              :value="row.entry.version"
              :aria-label="`${t('catalog.historyPage.to')} ${t('catalog.historyPage.version', { version: row.entry.version })}`"
              density="compact"
            />
          </div>
        </template>
        <div class="py-2">
          <div class="font-weight-medium d-flex flex-wrap align-center ga-1">
            {{ t('catalog.historyPage.version', { version: row.entry.version }) }}
            <v-chip v-if="row.entry.isCurrent" size="x-small" color="primary">
              {{ t('catalog.historyPage.current') }}
            </v-chip>
            <v-chip v-if="row.entry.revertedTo" size="x-small" variant="tonal">
              {{ t('moderation.history.revertedTo', { version: row.entry.revertedTo }) }}
            </v-chip>
            <v-chip v-if="row.entry.bulkRevertOf" size="x-small" variant="tonal" color="warning">
              {{ t('moderation.history.bulkRevert', { name: row.entry.bulkRevertOf.displayName }) }}
            </v-chip>
            <v-chip
              v-if="row.entry.mergedIngredient"
              size="x-small"
              variant="tonal"
              :to="row.entry.mergedIngredient.mergedInto ? localePath({ name: 'ingredients-id', params: { id: row.entry.mergedIngredient.mergedInto } }) : undefined"
            >
              {{ t('moderation.history.mergedIngredient') }}
            </v-chip>
          </div>
          <div class="text-body-2 text-medium-emphasis">
            {{ formatDateTime(row.entry.createdAt, locale) }} · {{ row.entry.author?.displayName ?? t('catalog.deletedAccount') }}
          </div>
          <div class="text-body-2 text-break">
            {{ row.entry.note ?? t('catalog.historyPage.noNote') }}
          </div>
          <v-btn
            v-if="canRevert && !row.entry.isCurrent"
            variant="text"
            size="small"
            density="comfortable"
            class="ml-n2"
            :prepend-icon="mdiBackupRestore"
            @click="revertTarget = row.entry.version"
          >
            {{ t('moderation.revert.action') }}
          </v-btn>
        </div>
      </div>
      <div v-else class="revision revision-event text-body-2 text-medium-emphasis" role="listitem">
        <div class="py-2">
          {{ t(`moderation.history.events.${row.event.kind}`, { name: row.event.actor?.displayName ?? t('catalog.deletedAccount') }) }}
          · {{ formatDateTime(row.event.createdAt, locale) }}
          <span v-if="row.event.reason" class="d-block text-break">{{ t('moderation.hidden.reason', { reason: eventReason(row.event) }) }}</span>
          <NuxtLink v-if="row.event.mergedInto" :to="localePath({ name: entityRouteName(entityType), params: { id: row.event.mergedInto } })" class="d-block">
            {{ t('moderation.history.mergedTarget') }}
          </NuxtLink>
        </div>
      </div>
    </template>
  </div>

  <v-pagination
    v-if="revisions && revisions.total > revisions.pageSize"
    v-model="page"
    :length="Math.ceil(revisions.total / revisions.pageSize)"
    density="comfortable"
    class="mb-4"
  />

  <CatalogRevertDialog
    v-if="revertTarget !== null"
    v-model="revertOpen"
    :entity-type="entityType"
    :entity-id="entityId"
    :version="revertTarget"
    :current-version="current"
    @done="emit('reverted', $event)"
    @reload="emit('reload')"
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
.revision-event {
  font-style: italic;
}
</style>
