<script setup lang="ts">
import { mdiClose, mdiMagnify, mdiPlus } from '@mdi/js'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { loggedIn } = useAuth()

useHead({ title: () => t('teas.title') })

// Suchbegriff, Seite, Tab und Zutatenfilter stehen in der URL (?q, ?page, ?mine, ?ingredient)
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const mine = computed(() => loggedIn.value && route.query.mine === '1')
const ingredientId = computed(() => (typeof route.query.ingredient === 'string' ? route.query.ingredient : undefined))

function setQuery(next: { q?: string, page?: number, mine?: boolean, ingredient?: string | null }) {
  const merged = {
    q: next.q ?? q.value,
    page: next.page ?? page.value,
    mine: next.mine ?? mine.value,
    ingredient: next.ingredient === undefined ? ingredientId.value : next.ingredient,
  }
  router.replace({
    query: {
      ...(merged.q ? { q: merged.q } : {}),
      ...(merged.page > 1 ? { page: merged.page } : {}),
      ...(merged.mine ? { mine: '1' } : {}),
      ...(merged.ingredient ? { ingredient: merged.ingredient } : {}),
    },
  })
}

const tab = computed({
  get: () => (mine.value ? 'mine' : 'all'),
  set: value => setQuery({ mine: value === 'mine', page: 1 }),
})

const search = ref(q.value)
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => setQuery({ q: (value ?? '').trim(), page: 1 }), 300)
})

const query = computed(() => ({
  q: q.value || undefined,
  page: page.value,
  locale: locale.value,
  ingredient: ingredientId.value,
  mine: mine.value ? '1' : undefined,
}))
const { data, pending, error, refresh } = await useFetch<Page<TeaListItem>>('/api/teas', { query })
const pageCount = computed(() => (data.value ? Math.ceil(data.value.total / data.value.pageSize) : 0))

// Name der gefilterten Zutat für den Filter-Chip
const { data: filterIngredient } = await useFetch<{ ingredient: IngredientDetail }>(
  () => `/api/ingredients/${ingredientId.value}`,
  { immediate: !!ingredientId.value, watch: [ingredientId] },
)
const filterText = useCatalogText(() => (ingredientId.value ? filterIngredient.value?.ingredient : null))
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-4 mb-4">
      <h1 class="text-h4 flex-grow-1">
        {{ t('teas.title') }}
      </h1>
      <v-btn v-if="loggedIn" color="primary" :prepend-icon="mdiPlus" :to="localePath({ name: 'teas-new' })">
        {{ t('teas.create') }}
      </v-btn>
    </div>

    <v-alert v-if="!loggedIn" type="info" variant="tonal" density="compact" class="mb-4">
      {{ t('teas.loginToCreate') }}
      <NuxtLink :to="localePath({ path: '/login', query: { redirect: route.fullPath } })">
        {{ t('nav.login') }}
      </NuxtLink>
    </v-alert>

    <v-tabs v-if="loggedIn" v-model="tab" color="primary" density="comfortable" class="mb-4">
      <v-tab value="all">
        {{ t('teas.tabs.all') }}
      </v-tab>
      <v-tab value="mine">
        {{ t('teas.tabs.mine') }}
      </v-tab>
    </v-tabs>

    <v-text-field
      v-model="search"
      :label="t('teas.search')"
      :prepend-inner-icon="mdiMagnify"
      clearable
      hide-details
      class="mb-4"
      @click:clear="search = ''"
    />

    <v-chip
      v-if="ingredientId && filterText"
      closable
      :close-icon="mdiClose"
      color="primary"
      variant="tonal"
      class="mb-4"
      @click:close="setQuery({ ingredient: null, page: 1 })"
    >
      {{ t('teas.filterIngredient', { name: filterText.text.name }) }}
    </v-chip>

    <v-progress-linear v-if="pending" indeterminate class="mb-2" />

    <!-- Ladefehler nicht als „leer“ ausgeben (00-chore/07) -->
    <LoadError v-if="error" @retry="refresh()" />

    <p v-else-if="data && !data.items.length" class="text-body-1 text-medium-emphasis">
      {{ t('teas.empty') }}
    </p>

    <v-list v-else lines="two" class="py-0">
      <v-list-item
        v-for="item in data?.items ?? []"
        :key="item.id"
        :to="localePath({ name: 'teas-id', params: { id: item.id } })"
        border
        rounded
        class="mb-2"
      >
        <v-list-item-title class="text-wrap">
          {{ item.name }}
        </v-list-item-title>
        <v-list-item-subtitle>
          {{ [item.brand, t(`teas.kind.${item.kind}`)].filter(Boolean).join(' · ') }}
        </v-list-item-subtitle>
        <template #append>
          <div class="d-flex flex-wrap justify-end ga-2">
            <v-chip v-if="mine" size="small" :color="item.visibility === 'private' ? undefined : 'primary'" variant="outlined">
              {{ t(`teas.visibility.${item.visibility}`) }}
            </v-chip>
            <v-chip v-if="!item.translated" size="small" variant="outlined">
              {{ t('catalog.notTranslated') }}
            </v-chip>
            <CatalogFactChips :caffeine="item.caffeine" compact />
          </div>
        </template>
      </v-list-item>
    </v-list>

    <v-pagination
      v-if="!error && pageCount > 1"
      :model-value="page"
      :length="pageCount"
      :total-visible="5"
      density="comfortable"
      class="mt-4"
      @update:model-value="(value: number) => setQuery({ page: value })"
    />
  </div>
</template>
