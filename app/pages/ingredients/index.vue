<script setup lang="ts">
import { mdiMagnify, mdiPlus } from '@mdi/js'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { loggedIn } = useAuth()

useHead({ title: () => t('ingredients.title') })

// Suchbegriff und Seite stehen in der URL (?q, ?page), damit Neuladen und Zurück funktionieren
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

function setQuery(next: { q?: string, page?: number }) {
  const merged = { q: next.q ?? q.value, page: next.page ?? page.value }
  router.replace({ query: { ...(merged.q ? { q: merged.q } : {}), ...(merged.page > 1 ? { page: merged.page } : {}) } })
}

const search = ref(q.value)
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => setQuery({ q: (value ?? '').trim(), page: 1 }), 300)
})

const query = computed(() => ({ q: q.value || undefined, page: page.value, locale: locale.value }))
const { data, pending } = await useFetch<Page<IngredientListItem>>('/api/ingredients', { query })
const pageCount = computed(() => (data.value ? Math.ceil(data.value.total / data.value.pageSize) : 0))
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-4 mb-4">
      <h1 class="text-h4 flex-grow-1">
        {{ t('ingredients.title') }}
      </h1>
      <v-btn v-if="loggedIn" color="primary" :prepend-icon="mdiPlus" :to="localePath({ name: 'ingredients-new' })">
        {{ t('ingredients.create') }}
      </v-btn>
    </div>

    <v-alert v-if="!loggedIn" type="info" variant="tonal" density="compact" class="mb-4">
      {{ t('ingredients.loginToCreate') }}
      <NuxtLink :to="localePath({ path: '/login', query: { redirect: route.fullPath } })">
        {{ t('nav.login') }}
      </NuxtLink>
    </v-alert>

    <v-text-field
      v-model="search"
      :label="t('ingredients.search')"
      :prepend-inner-icon="mdiMagnify"
      clearable
      hide-details
      class="mb-4"
      @click:clear="search = ''"
    />

    <v-progress-linear v-if="pending" indeterminate class="mb-2" />

    <p v-if="data && !data.items.length" class="text-body-1 text-medium-emphasis">
      {{ t('ingredients.empty') }}
    </p>

    <v-list v-else lines="one" class="py-0">
      <v-list-item
        v-for="item in data?.items ?? []"
        :key="item.id"
        :to="localePath({ name: 'ingredients-id', params: { id: item.id } })"
        border
        rounded
        class="mb-2"
      >
        <v-list-item-title class="text-wrap">
          {{ item.name }}
        </v-list-item-title>
        <template #append>
          <div class="d-flex flex-wrap justify-end ga-2">
            <v-chip v-if="!item.translated" size="small" variant="outlined">
              {{ t('ingredients.notTranslated') }}
            </v-chip>
            <IngredientFacts :caffeine="item.caffeine" compact />
          </div>
        </template>
      </v-list-item>
    </v-list>

    <v-pagination
      v-if="pageCount > 1"
      :model-value="page"
      :length="pageCount"
      :total-visible="5"
      density="comfortable"
      class="mt-4"
      @update:model-value="(value: number) => setQuery({ page: value })"
    />
  </div>
</template>
