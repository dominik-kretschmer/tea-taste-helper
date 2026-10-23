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
  const isIngredientEvent = entry.event === 'INGREDIENT_CREATED' || entry.event === 'INGREDIENT_UPDATED'
  return isIngredientEvent && typeof entry.details?.ingredientId === 'string' ? entry.details.ingredientId : null
}

/**
 * Tee-Ereignisse: Link nur bei öffentlichen Tees; private sehen Admins nicht (04, AK-9.1),
 * gelöschte gibt es nicht mehr.
 */
function teaLink(entry: AuditEntry): { id: string | null, version: unknown } | null {
  if (!entry.event.startsWith('TEA_') || typeof entry.details?.teaId !== 'string') return null
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
        <template v-if="ingredientId(item)">
          {{ t('audit.version', { version: item.details?.version }) }} ·
          <NuxtLink :to="localePath({ name: 'ingredients-id', params: { id: ingredientId(item) } })">
            {{ t('audit.showIngredient') }}
          </NuxtLink>
        </template>
        <template v-else-if="teaLink(item)">
          <template v-if="teaLink(item)!.version">
            {{ t('audit.version', { version: teaLink(item)!.version }) }} ·
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
