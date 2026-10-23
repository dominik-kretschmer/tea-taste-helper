<script setup lang="ts">
import { mdiAccountCancelOutline, mdiCallMerge, mdiCheck, mdiClose, mdiEyeOffOutline, mdiHistory } from '@mdi/js'

// Meldungen nach Eintrag gruppiert, offen und abgeschlossen (05 AK-3.1–3.3)
definePageMeta({ middleware: 'moderator' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { $api } = useNuxtApp()
const { refresh: refreshBadge } = useOpenReports()
const { formError, handleError } = useFormErrors()

useHead({ title: () => `${t('admin.tabs.reports')} – ${t('moderation.title')}` })

const query = reactive({
  status: 'open' as 'open' | 'closed',
  reason: undefined as ReportReasonValue | undefined,
  type: undefined as CatalogTypeValue | undefined,
  page: 1,
})
watch(() => [query.status, query.reason, query.type], () => {
  query.page = 1
})
const { data, pending, error, refresh } = await useFetch<Page<ReportGroup>>('/api/admin/reports', {
  query: computed(() => ({ ...query, locale: locale.value })),
})

async function reload() {
  await Promise.all([refresh(), refreshBadge()])
}

// Dialoge: jeweils für eine Gruppe
const active = ref<ReportGroup | null>(null)
const dialog = ref<'merge' | 'hide' | 'block' | 'resolved' | 'rejected' | null>(null)
const dialogOpen = (name: NonNullable<typeof dialog.value>) => computed({
  get: () => dialog.value === name,
  set: (value) => { if (!value) dialog.value = null },
})
const mergeOpen = dialogOpen('merge')
const hideOpen = dialogOpen('hide')
const blockOpen = dialogOpen('block')
function openDialog(group: ReportGroup, name: NonNullable<typeof dialog.value>) {
  active.value = group
  formError.value = null
  note.value = ''
  dialog.value = name
}
/** Vorausgewähltes Ziel: Original der ersten Duplikat-Meldung (AK-3.2) */
const suggestedTarget = computed(() => active.value?.reports.find(report => report.duplicateOf)?.duplicateOf?.id ?? null)

const note = ref('')
const busy = ref(false)
const snackbar = ref<string | null>(null)
async function resolve() {
  if (!active.value || (dialog.value !== 'resolved' && dialog.value !== 'rejected')) return
  busy.value = true
  try {
    await $api('/api/admin/reports/resolve', {
      method: 'POST',
      body: { entityType: active.value.entityType, entityId: active.value.entityId, status: dialog.value, note: note.value },
    })
    dialog.value = null
    snackbar.value = t('moderation.reports.closed')
    await reload()
  }
  catch (err) {
    handleError(err)
  }
  finally {
    busy.value = false
  }
}
async function afterAction() {
  dialog.value = null
  await reload()
}
</script>

<template>
  <div>
    <AdminNav />

    <v-tabs v-model="query.status" density="compact" class="mb-2">
      <v-tab value="open">
        {{ t('moderation.reports.tabs.open') }}
      </v-tab>
      <v-tab value="closed">
        {{ t('moderation.reports.tabs.closed') }}
      </v-tab>
    </v-tabs>

    <v-row density="compact" class="mb-2">
      <v-col cols="12" sm="6">
        <v-select
          v-model="query.reason"
          :items="REPORT_REASONS.map(value => ({ value, title: t(`moderation.report.reasons.${value}`) }))"
          :label="t('moderation.reports.filters.reason')"
          clearable
          hide-details
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-select
          v-model="query.type"
          :items="CATALOG_TYPES.map(value => ({ value, title: t(`moderation.entryTypes.${value}`) }))"
          :label="t('moderation.reports.filters.type')"
          clearable
          hide-details
        />
      </v-col>
    </v-row>

    <LoadError v-if="error" @retry="refresh()" />
    <template v-else>
      <v-progress-linear v-if="pending" indeterminate class="mb-2" />
      <p v-if="data && !data.items.length" class="text-medium-emphasis">
        {{ query.status === 'open' ? t('moderation.reports.empty') : t('moderation.reports.emptyClosed') }}
      </p>

      <v-card v-for="group in data?.items ?? []" :key="`${group.entityType}:${group.entityId}`" variant="outlined" class="mb-3">
        <v-card-item>
          <v-card-title class="text-wrap text-break">
            <NuxtLink :to="localePath({ name: entityRouteName(group.entityType), params: { id: group.entityId } })">
              {{ group.name }}
            </NuxtLink>
          </v-card-title>
          <v-card-subtitle class="d-flex flex-wrap ga-1 align-center">
            <v-chip size="x-small" variant="tonal">
              {{ t(`moderation.entryTypes.${group.entityType}`) }}
            </v-chip>
            <v-chip v-if="group.state !== 'active'" size="x-small" color="warning" variant="tonal">
              {{ t(`moderation.states.${group.state}`) }}
            </v-chip>
            <span>{{ t('moderation.reports.count', { count: group.count, date: formatDateTime(group.oldestAt, locale) }) }}</span>
          </v-card-subtitle>
        </v-card-item>

        <v-expansion-panels variant="accordion" flat>
          <v-expansion-panel :title="group.lastAuthor ? t('moderation.reports.lastAuthor', { name: group.lastAuthor.displayName }) : t('catalog.deletedAccount')">
            <v-expansion-panel-text>
              <div v-for="report in group.reports" :key="report.id" class="mb-3">
                <div class="font-weight-medium">
                  {{ t(`moderation.report.reasons.${report.reason}`) }}
                </div>
                <div class="text-body-2 text-medium-emphasis">
                  {{ t('moderation.reports.reporter', { name: report.reporter?.displayName ?? t('catalog.deletedAccount'), date: formatDateTime(report.createdAt, locale) }) }}
                </div>
                <div v-if="report.comment" class="text-body-2 text-break comment">
                  {{ report.comment }}
                </div>
                <div v-if="report.duplicateOf" class="text-body-2">
                  {{ t('moderation.reports.duplicateOf') }}
                  <NuxtLink :to="localePath({ name: entityRouteName(group.entityType), params: { id: report.duplicateOf.id } })">
                    {{ report.duplicateOf.name }}
                  </NuxtLink>
                </div>
                <div v-if="report.status !== 'open'" class="text-body-2 text-medium-emphasis">
                  {{ t('moderation.reports.closedBy', {
                    status: t(`moderation.reports.status.${report.status}`),
                    name: report.resolvedBy?.displayName ?? t('catalog.deletedAccount'),
                    date: formatDateTime(report.resolvedAt!, locale),
                  }) }}
                  <span v-if="report.resolutionNote" class="d-block text-break">{{ report.resolutionNote }}</span>
                </div>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <v-card-actions class="flex-wrap ga-1">
          <v-btn size="small" :prepend-icon="mdiHistory" :to="localePath({ name: entityRouteName(group.entityType, 'history'), params: { id: group.entityId } })">
            {{ t('moderation.reports.actions.history') }}
          </v-btn>
          <template v-if="query.status === 'open'">
            <template v-if="group.state === 'active'">
              <v-btn size="small" :prepend-icon="mdiCallMerge" @click="openDialog(group, 'merge')">
                {{ t('moderation.reports.actions.merge') }}
              </v-btn>
              <v-btn size="small" :prepend-icon="mdiEyeOffOutline" @click="openDialog(group, 'hide')">
                {{ t('moderation.reports.actions.hide') }}
              </v-btn>
            </template>
            <v-btn v-if="group.lastAuthor" size="small" :prepend-icon="mdiAccountCancelOutline" @click="openDialog(group, 'block')">
              {{ t('moderation.reports.actions.blockAuthor') }}
            </v-btn>
            <v-spacer />
            <v-btn size="small" color="success" :prepend-icon="mdiCheck" @click="openDialog(group, 'resolved')">
              {{ t('moderation.reports.actions.resolve') }}
            </v-btn>
            <v-btn size="small" :prepend-icon="mdiClose" @click="openDialog(group, 'rejected')">
              {{ t('moderation.reports.actions.reject') }}
            </v-btn>
          </template>
        </v-card-actions>
      </v-card>

      <v-pagination
        v-if="data && data.total > data.pageSize"
        v-model="query.page"
        :length="Math.ceil(data.total / data.pageSize)"
        density="comfortable"
      />
    </template>

    <template v-if="active">
      <ModerationMergeDialog v-model="mergeOpen" :entity-type="active.entityType" :source-id="active.entityId" :initial-target="suggestedTarget" />
      <ModerationHideDialog v-model="hideOpen" :entity-type="active.entityType" :entity-id="active.entityId" @done="afterAction" @merge="dialog = 'merge'" />
      <ModerationBlockDialog v-if="active.lastAuthor" v-model="blockOpen" :user="active.lastAuthor" @done="(user) => { snackbar = t('moderation.block.done', { name: user.displayName }); afterAction() }" />
    </template>

    <v-dialog :model-value="dialog === 'resolved' || dialog === 'rejected'" max-width="440" @update:model-value="dialog = null">
      <v-card v-if="dialog === 'resolved' || dialog === 'rejected'" :title="t('moderation.reports.resolveTitle', { status: t(`moderation.reports.status.${dialog}`) })">
        <v-card-text>
          <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-4" :text="formError" />
          <v-textarea v-model="note" :label="t('moderation.reports.resolveNote')" :counter="MODERATION_TEXT_MAX" rows="2" auto-grow />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="dialog = null">
            {{ t('common.cancel') }}
          </v-btn>
          <v-btn :color="dialog === 'resolved' ? 'success' : 'primary'" variant="flat" :loading="busy" @click="resolve">
            {{ t(`moderation.reports.actions.${dialog === 'resolved' ? 'resolve' : 'reject'}`) }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="!!snackbar" color="success" :text="snackbar ?? ''" @update:model-value="snackbar = null" />
  </div>
</template>

<style scoped>
.comment {
  white-space: pre-line;
}
</style>
