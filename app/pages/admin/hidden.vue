<script setup lang="ts">
// Ausgeblendete Einträge, zuletzt ausgeblendete zuerst (05 AK-5.4)
definePageMeta({ middleware: 'moderator' })

const { t, locale } = useI18n()
const localePath = useLocalePath()

useHead({ title: () => `${t('admin.tabs.hidden')} – ${t('moderation.title')}` })

const query = reactive({ type: undefined as CatalogTypeValue | undefined, page: 1 })
watch(() => query.type, () => {
  query.page = 1
})
const { data, pending, error, refresh } = await useFetch<Page<HiddenEntry>>('/api/admin/hidden', {
  query: computed(() => ({ ...query, locale: locale.value })),
})

const reasonText = (entry: HiddenEntry) => (entry.hiddenReason === BULK_REVERT_REASON ? t('moderation.hidden.bulkReason') : entry.hiddenReason)
</script>

<template>
  <div>
    <AdminNav />

    <v-select
      v-model="query.type"
      :items="CATALOG_TYPES.map(value => ({ value, title: t(`moderation.entryTypes.${value}`) }))"
      :label="t('moderation.reports.filters.type')"
      clearable
      hide-details
      class="mb-4"
      max-width="320"
    />

    <LoadError v-if="error" @retry="refresh()" />
    <template v-else>
      <v-progress-linear v-if="pending" indeterminate class="mb-2" />
      <p v-if="data && !data.items.length" class="text-medium-emphasis">
        {{ t('moderation.hiddenPage.empty') }}
      </p>
      <v-list v-else lines="three" class="py-0">
        <v-list-item
          v-for="entry in data?.items ?? []"
          :key="`${entry.entityType}:${entry.entityId}`"
          :to="localePath({ name: entityRouteName(entry.entityType), params: { id: entry.entityId } })"
          class="px-0"
        >
          <v-list-item-title class="text-wrap text-break">
            {{ entry.name }}
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ t(`moderation.entryTypes.${entry.entityType}`) }} ·
            {{ t('moderation.hiddenPage.by', { name: entry.hiddenBy?.displayName ?? t('catalog.deletedAccount'), date: formatDateTime(entry.hiddenAt, locale) }) }}
          </v-list-item-subtitle>
          <div class="text-body-2 text-break">
            {{ t('moderation.hidden.reason', { reason: reasonText(entry) }) }}
          </div>
        </v-list-item>
      </v-list>
      <v-pagination
        v-if="data && data.total > data.pageSize"
        v-model="query.page"
        :length="Math.ceil(data.total / data.pageSize)"
        density="comfortable"
      />
    </template>
  </div>
</template>
