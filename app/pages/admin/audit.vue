<script setup lang="ts">
definePageMeta({ middleware: 'admin' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

useHead({ title: () => `${t('admin.tabs.audit')} – ${t('admin.title')}` })

const query = reactive({
  event: undefined as AuditEventType | undefined,
  userId: typeof route.query.userId === 'string' ? route.query.userId : undefined,
  page: 1,
})
watch(() => [query.event, query.userId], () => {
  query.page = 1
})

const { data, pending, error, refresh } = await useFetch<Page<AuditEntry>>('/api/admin/audit', { query })

// Nutzerfilter: Suche über die Nutzer-API; ein per Link übergebener Nutzer bleibt auswählbar
const userSearch = ref('')
const { data: userOptions } = await useFetch<Page<AdminUser>>('/api/admin/users', {
  query: computed(() => ({ q: userSearch.value || undefined })),
})
const userItems = computed(() => {
  const items = (userOptions.value?.items ?? []).map(user => ({ value: user.id, title: `${user.displayName} (${user.email})` }))
  const preset = data.value?.items.flatMap(entry => [entry.actor, entry.target]).find(person => person?.id === query.userId)
  if (query.userId && preset && !items.some(item => item.value === query.userId)) {
    items.unshift({ value: preset.id, title: preset.displayName })
  }
  return items
})

const eventItems = computed(() => AUDIT_EVENTS.map(event => ({ value: event, title: t(`audit.events.${event}`) })))

const headers = computed(() => [
  { title: t('audit.headers.createdAt'), key: 'createdAt', sortable: false },
  { title: t('audit.headers.event'), key: 'event', sortable: false },
  { title: t('audit.headers.actor'), key: 'actor', sortable: false },
  { title: t('audit.headers.target'), key: 'target', sortable: false },
  { title: t('audit.headers.details'), key: 'details', sortable: false },
  { title: t('audit.headers.ip'), key: 'ip', sortable: false },
])

/** Zutat-Ereignisse tragen die Zutat in `details` (targetId verweist nur auf Nutzer). */
function ingredientId(entry: AuditEntry): string | null {
  const isIngredientEvent = ['INGREDIENT_CREATED', 'INGREDIENT_UPDATED', 'INGREDIENT_REVERTED', 'INGREDIENT_HIDDEN', 'INGREDIENT_RESTORED'].includes(entry.event)
  return isIngredientEvent && typeof entry.details?.ingredientId === 'string' ? entry.details.ingredientId : null
}

/** Moderationsereignisse (05 AK-8.2): Text und optional ein Link auf Eintrag bzw. Ziel */
function moderationDetails(entry: AuditEntry): { text: string, link?: { name: string, id: string, label: string } } | null {
  const d = entry.details ?? {}
  const type: CatalogTypeValue | null = entry.event.startsWith('INGREDIENT_') ? 'ingredient' : entry.event.startsWith('TEA_') ? 'tea' : null
  switch (entry.event) {
    case 'INGREDIENT_MERGED':
    case 'TEA_MERGED':
      return {
        text: entry.event === 'INGREDIENT_MERGED' ? t('audit.moderation.teasChanged', { count: Number(d.teasChanged ?? 0) }) : '',
        link: { name: entityRouteName(type!), id: String(d.targetId), label: t('audit.moderation.showTarget') },
      }
    case 'USER_BLOCKED':
      return { text: [d.until ? t('audit.moderation.blockedUntil', { date: formatDateTime(String(d.until), locale.value) }) : t('audit.moderation.permanent'), d.reason].filter(Boolean).join(' · ') }
    case 'BULK_REVERT':
      return { text: t('audit.moderation.bulk', { reverted: Number(d.reverted ?? 0), hidden: Number(d.hidden ?? 0), skipped: Number(d.skipped ?? 0) }) }
    case 'REPORT_CREATED':
    case 'REPORT_RESOLVED': {
      const entryType = d.entityType as CatalogTypeValue
      const text = entry.event === 'REPORT_CREATED'
        ? t(`moderation.report.reasons.${String(d.reason)}`)
        : t('audit.moderation.reports', { count: Number(d.count ?? 0), status: t(`moderation.reports.status.${String(d.status)}`) })
      return { text, link: { name: entityRouteName(entryType), id: String(d.entityId), label: t('audit.moderation.showEntry') } }
    }
    case 'TEA_HIDDEN':
    case 'INGREDIENT_HIDDEN':
      return { text: d.reason === BULK_REVERT_REASON ? t('moderation.hidden.bulkReason') : String(d.reason ?? '') }
    default:
      return null
  }
}

/**
 * Tee-Ereignisse: Link nur bei öffentlichen Tees; private sehen Admins nicht (04, AK-9.1),
 * gelöschte gibt es nicht mehr.
 */
function teaLink(entry: AuditEntry): { id: string | null, version: unknown } | null {
  if (!entry.event.startsWith('TEA_') || entry.event === 'TEA_MERGED' || typeof entry.details?.teaId !== 'string') return null
  const linkable = !entry.details.private && entry.event !== 'TEA_DELETED'
  return { id: linkable ? entry.details.teaId : null, version: entry.details.version }
}

function describe(entry: AuditEntry): string {
  const details = entry.details ?? {}
  if (entry.event === 'ROLE_CHANGED') {
    return `${t(`roles.${details.from}`)} → ${t(`roles.${details.to}`)}`
  }
  if (entry.event === 'ADMIN_BOOTSTRAPPED') return t(`audit.via.${details.via}`)
  if (entry.event === 'LOGIN_FAILED') {
    return [details.email, details.reason === 'blocked' ? t('audit.blocked') : null].filter(Boolean).join(' · ')
  }
  return ''
}
</script>

<template>
  <div>
    <AdminNav />

    <v-row density="compact" class="mb-2">
      <v-col cols="12" md="5">
        <v-select
          v-model="query.event"
          :items="eventItems"
          :label="t('audit.filters.event')"
          clearable
          hide-details
        />
      </v-col>
      <v-col cols="12" md="7">
        <v-autocomplete
          v-model="query.userId"
          v-model:search="userSearch"
          :items="userItems"
          :label="t('audit.filters.user')"
          no-filter
          clearable
          hide-details
        />
      </v-col>
    </v-row>

    <!-- Ladefehler statt leerer Tabelle (00-chore/07) -->
    <LoadError v-if="error" @retry="refresh()" />

    <v-data-table-server
      v-else
      v-model:page="query.page"
      :headers="headers"
      :items="data?.items ?? []"
      :items-length="data?.total ?? 0"
      :items-per-page="50"
      :items-per-page-options="[{ value: 50, title: '50' }]"
      :loading="pending"
      mobile-breakpoint="md"
      item-value="id"
    >
      <template #[`item.createdAt`]="{ item }">
        <span class="text-no-wrap">{{ formatDateTime(item.createdAt, locale) }}</span>
      </template>
      <template #[`item.event`]="{ item }">
        {{ t(`audit.events.${item.event}`) }}
      </template>
      <template #[`item.actor`]="{ item }">
        {{ item.actor?.displayName ?? '–' }}
      </template>
      <template #[`item.target`]="{ item }">
        {{ item.target?.displayName ?? '–' }}
      </template>
      <template #[`item.details`]="{ item }">
        <template v-if="moderationDetails(item)">
          {{ moderationDetails(item)!.text }}
          <template v-if="moderationDetails(item)!.link">
            <template v-if="moderationDetails(item)!.text">
              ·
            </template>
            <NuxtLink :to="localePath({ name: moderationDetails(item)!.link!.name, params: { id: moderationDetails(item)!.link!.id } })">
              {{ moderationDetails(item)!.link!.label }}
            </NuxtLink>
          </template>
        </template>
        <template v-else-if="ingredientId(item)">
          <template v-if="item.details?.version">
            {{ t('audit.version', { version: item.details.version }) }}
            <template v-if="item.details.revertedTo">
              ({{ t('audit.moderation.revertedTo', { version: item.details.revertedTo }) }})
            </template>
            ·
          </template>
          <NuxtLink :to="localePath({ name: 'ingredients-id', params: { id: ingredientId(item) } })">
            {{ t('audit.showIngredient') }}
          </NuxtLink>
        </template>
        <template v-else-if="teaLink(item)">
          <template v-if="teaLink(item)!.version">
            {{ t('audit.version', { version: teaLink(item)!.version }) }}
            <template v-if="item.details?.revertedTo">
              ({{ t('audit.moderation.revertedTo', { version: item.details.revertedTo }) }})
            </template>
            ·
          </template>
          <NuxtLink v-if="teaLink(item)!.id" :to="localePath({ name: 'teas-id', params: { id: teaLink(item)!.id } })">
            {{ t('audit.showTea') }}
          </NuxtLink>
          <span v-else class="text-medium-emphasis">{{ t('audit.privateTea') }}</span>
        </template>
        <template v-else>
          {{ describe(item) }}
        </template>
      </template>
    </v-data-table-server>
  </div>
</template>
