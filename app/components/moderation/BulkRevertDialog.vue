<script setup lang="ts">
// Alle Änderungen eines Nutzers ab einem Zeitpunkt zurücksetzen: Zeitraum, Vorschau, Ergebnis (05 AK-7.1–7.5, AK-9.3)
const props = defineProps<{ user: { id: string, displayName: string } }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ done: [] }>()

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { $api } = useNuxtApp()
const { formError, handleError, reset } = useFormErrors()

type Period = '24h' | '7d' | '30d' | 'since'
const PERIODS: Period[] = ['24h', '7d', '30d', 'since']
const DAY = 24 * 60 * 60 * 1000
const period = ref<Period>('24h')
const sinceDate = ref('')
const plan = ref<BulkRevertPlan | null>(null)
const result = ref<BulkRevertResult | null>(null)
const loading = ref(false)
const busy = ref(false)

/** Zeitraum als Zeitpunkt; „Ab Datum“ gilt ab Mitternacht (Ortszeit) */
const since = computed(() => {
  if (period.value === 'since') return sinceDate.value ? new Date(`${sinceDate.value}T00:00:00`) : null
  const days = { '24h': 1, '7d': 7, '30d': 30 }[period.value]
  return new Date(Date.now() - days * DAY)
})

async function loadPlan() {
  plan.value = null
  formError.value = null
  if (!since.value || Number.isNaN(since.value.getTime())) return
  loading.value = true
  try {
    plan.value = await $fetch<BulkRevertPlan>(`/api/admin/users/${props.user.id}/bulk-revert`, { query: { since: since.value.toISOString(), locale: locale.value } })
  }
  catch (err) {
    handleError(err)
  }
  finally {
    loading.value = false
  }
}

// immediate: Der Dialog wird oft erst beim Öffnen eingebunden (v-if), dann ändert sich `open` nicht mehr
watch(open, (value) => {
  if (!value) return
  period.value = '24h'
  sinceDate.value = ''
  result.value = null
  reset()
  loadPlan()
}, { immediate: true })
watch([period, sinceDate], () => {
  if (open.value && !result.value) loadPlan()
})

async function submit() {
  if (!since.value) return
  busy.value = true
  try {
    result.value = await $api<BulkRevertResult>(`/api/admin/users/${props.user.id}/bulk-revert`, {
      method: 'POST',
      body: { since: since.value.toISOString(), locale: locale.value },
    })
    emit('done')
  }
  catch (err) {
    handleError(err)
  }
  finally {
    busy.value = false
  }
}

const shown = computed(() => result.value ?? plan.value)
const empty = computed(() => !!shown.value && !shown.value.revert.length && !shown.value.hide.length && !shown.value.skip.length)
const sections = computed(() => {
  const data = shown.value
  if (!data) return []
  const done = !!result.value
  return [
    { key: 'revert', title: t(done ? 'moderation.bulk.resultRevert' : 'moderation.bulk.revert', { count: data.revert.length }), items: data.revert },
    { key: 'hide', title: t(done ? 'moderation.bulk.resultHide' : 'moderation.bulk.hide', { count: data.hide.length }), items: data.hide },
    { key: 'skip', title: t(done ? 'moderation.bulk.resultSkip' : 'moderation.bulk.skip', { count: data.skip.length }), items: data.skip },
  ].filter(section => section.items.length)
})
const detail = (item: BulkItem & { reason?: BulkSkipReason }) =>
  item.reason ? t(`moderation.bulk.reasons.${item.reason}`) : item.toVersion ? t('moderation.bulk.toVersion', { version: item.toVersion }) : ''
</script>

<template>
  <v-dialog v-model="open" max-width="600" scrollable>
    <v-card :title="t('moderation.bulk.title', { name: user.displayName })">
      <v-card-text>
        <template v-if="!result">
          <v-select
            v-model="period"
            :items="PERIODS.map(value => ({ value, title: t(`moderation.bulk.periods.${value}`) }))"
            :label="t('moderation.bulk.period')"
          />
          <v-text-field v-if="period === 'since'" v-model="sinceDate" type="date" :label="t('moderation.bulk.since')" />
        </template>
        <v-progress-linear v-if="loading" indeterminate class="mb-2" />
        <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-4" :text="formError" />
        <p v-if="empty" class="text-medium-emphasis">
          {{ t('moderation.bulk.nothing') }}
        </p>
        <div v-for="section in sections" :key="section.key" class="mb-2">
          <h3 class="text-subtitle-1 font-weight-medium">
            {{ section.title }}
          </h3>
          <v-list density="compact" class="py-0">
            <v-list-item
              v-for="item in section.items"
              :key="`${item.entityType}:${item.entityId}`"
              :title="item.name"
              :subtitle="`${t(`moderation.entryTypes.${item.entityType}`)} · ${detail(item)}`"
              :to="localePath({ name: entityRouteName(item.entityType, section.key === 'skip' ? 'history' : ''), params: { id: item.entityId } })"
              class="px-0"
            />
          </v-list>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">
          {{ result ? t('common.close') : t('common.cancel') }}
        </v-btn>
        <v-btn v-if="!result" color="error" variant="flat" :disabled="!plan || empty" :loading="busy" @click="submit">
          {{ t('moderation.bulk.action') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
