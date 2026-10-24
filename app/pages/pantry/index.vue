<script setup lang="ts">
import { mdiDotsVertical, mdiMagnify, mdiPlus } from '@mdi/js'

// Eigener Vorrat (06 AK-1.1–1.4, AK-2.1, AK-3.1, AK-3.2, AK-4.1)
definePageMeta({ middleware: 'auth' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { $api } = useNuxtApp()
const amount = usePantryAmount()

useHead({ title: () => t('pantry.title') })

// Tab, Suchbegriff und Seite stehen in der URL (?type, ?q, ?page)
const type = computed<CatalogTypeValue>(() => (route.query.type === 'tea' ? 'tea' : 'ingredient'))
const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

function setQuery(next: { type?: CatalogTypeValue, q?: string, page?: number }) {
  const merged = { type: next.type ?? type.value, q: next.q ?? q.value, page: next.page ?? page.value }
  router.replace({
    query: {
      ...(merged.type === 'tea' ? { type: 'tea' } : {}),
      ...(merged.q ? { q: merged.q } : {}),
      ...(merged.page > 1 ? { page: merged.page } : {}),
    },
  })
}

const tab = computed({
  get: () => type.value,
  set: value => setQuery({ type: value, page: 1 }),
})

const search = ref(q.value)
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => setQuery({ q: (value ?? '').trim(), page: 1 }), 300)
})

const query = computed(() => ({ type: type.value, q: q.value || undefined, page: page.value, locale: locale.value }))
const { data, pending, error, refresh } = await useFetch<PantryPage>('/api/pantry', { query })
const pageCount = computed(() => (data.value ? Math.ceil(data.value.total / data.value.pageSize) : 0))
const pantryEmpty = computed(() => !!data.value && data.value.counts.ingredient + data.value.counts.tea === 0)

// Dialoge
const entryDialog = ref(false)
const editing = ref<PantryEntry | null>(null)
const removing = ref<PantryEntry | null>(null)
const removeDialog = ref(false)
const busy = ref(false)
const { formError, handleError } = useFormErrors()

function openAdd() {
  editing.value = null
  entryDialog.value = true
}

function openEdit(entry: PantryEntry) {
  editing.value = entry
  entryDialog.value = true
}

function openRemove(entry: PantryEntry) {
  removing.value = entry
  removeDialog.value = true
}

async function onSaved(entry: PantryRef) {
  // Neu hinzugefügt: zum passenden Tab wechseln, damit der Eintrag sichtbar ist
  if (entry.entityType !== type.value) setQuery({ type: entry.entityType, page: 1 })
  else await refresh()
}

async function useUp(entry: PantryEntry) {
  formError.value = null
  try {
    await $api(`/api/pantry/${entry.id}`, { method: 'PATCH', body: { grams: 0 } })
  }
  catch (err) {
    handleError(err)
  }
  await refresh()
}

// Rückgängig: derselbe Eintrag mit derselben Menge wird neu angelegt (AK-4.1)
const removed = ref<PantryEntry | null>(null)
const snackbar = ref(false)

async function confirmRemove() {
  const entry = removing.value
  if (!entry) return
  busy.value = true
  formError.value = null
  try {
    await $api(`/api/pantry/${entry.id}`, { method: 'DELETE' })
    removed.value = entry
    snackbar.value = true
  }
  catch (err) {
    handleError(err)
  }
  finally {
    busy.value = false
    removeDialog.value = false
  }
  await refresh()
}

async function undo() {
  const entry = removed.value
  snackbar.value = false
  if (!entry) return
  formError.value = null
  try {
    await $api('/api/pantry', { method: 'POST', body: { entityType: entry.entityType, entityId: entry.entityId, grams: entry.grams } })
  }
  catch (err) {
    handleError(err)
  }
  await refresh()
}

const detailRoute = (entry: PantryEntry) =>
  localePath({ name: entry.entityType === 'ingredient' ? 'ingredients-id' : 'teas-id', params: { id: entry.entityId } })
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center ga-4 mb-4">
      <h1 class="text-h4 flex-grow-1">
        {{ t('pantry.title') }}
      </h1>
      <v-btn color="primary" :prepend-icon="mdiPlus" @click="openAdd">
        {{ t('pantry.add') }}
      </v-btn>
    </div>

    <v-tabs v-model="tab" color="primary" density="comfortable" class="mb-4">
      <v-tab value="ingredient">
        {{ t('pantry.tabs.ingredient', { count: data?.counts.ingredient ?? 0 }) }}
      </v-tab>
      <v-tab value="tea">
        {{ t('pantry.tabs.tea', { count: data?.counts.tea ?? 0 }) }}
      </v-tab>
    </v-tabs>

    <v-text-field
      v-model="search"
      :label="t('pantry.search')"
      :prepend-inner-icon="mdiMagnify"
      clearable
      hide-details
      class="mb-4"
      @click:clear="search = ''"
    />

    <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-4" :text="formError" closable @click:close="formError = null" />

    <v-progress-linear v-if="pending" indeterminate class="mb-2" />

    <LoadError v-if="error" @retry="refresh()" />

    <v-alert v-else-if="pantryEmpty" type="info" variant="tonal">
      {{ t('pantry.empty') }}
      <template #append>
        <v-btn variant="text" :prepend-icon="mdiPlus" @click="openAdd">
          {{ t('pantry.add') }}
        </v-btn>
      </template>
    </v-alert>

    <p v-else-if="data && !data.items.length" class="text-body-1 text-medium-emphasis">
      {{ t('pantry.noResults') }}
    </p>

    <v-list v-else lines="two" class="py-0">
      <v-list-item
        v-for="item in data?.items ?? []"
        :key="item.id"
        :to="item.hidden ? undefined : detailRoute(item)"
        border
        rounded
        class="mb-2"
        :class="{ 'text-medium-emphasis': item.hidden || item.empty }"
      >
        <v-list-item-title class="text-wrap">
          {{ item.name }}
        </v-list-item-title>
        <v-list-item-subtitle v-if="item.brand">
          {{ item.brand }}
        </v-list-item-subtitle>
        <template #append>
          <div class="d-flex align-center ga-1">
            <v-chip size="small" variant="outlined" :color="item.hidden ? 'warning' : item.empty ? undefined : 'primary'">
              {{ item.hidden ? t('pantry.unavailable') : amount(item.grams) }}
            </v-chip>
            <v-menu location="bottom end">
              <template #activator="{ props }">
                <v-btn v-bind="props" :icon="mdiDotsVertical" variant="text" size="small" :aria-label="t('pantry.actions.menu', { name: item.name })" @click.prevent />
              </template>
              <v-list density="compact">
                <template v-if="!item.hidden">
                  <v-list-item :title="t('pantry.actions.edit')" @click="openEdit(item)" />
                  <v-list-item v-if="!item.empty" :title="t('pantry.actions.useUp')" @click="useUp(item)" />
                </template>
                <v-list-item :title="t('pantry.actions.remove')" base-color="error" @click="openRemove(item)" />
              </v-list>
            </v-menu>
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

    <PantryEntryDialog
      v-if="entryDialog"
      v-model="entryDialog"
      :type="type"
      :entry="editing ? { id: editing.id, name: editing.name, grams: editing.grams } : undefined"
      @saved="onSaved"
    />
    <PantryRemoveDialog
      v-if="removeDialog && removing"
      v-model="removeDialog"
      :name="removing.name"
      :grams="removing.grams"
      :busy="busy"
      @confirm="confirmRemove"
    />

    <v-snackbar v-model="snackbar" :timeout="5000">
      {{ t('pantry.remove.done', { name: removed?.name ?? '' }) }}
      <template #actions>
        <v-btn color="primary" variant="text" @click="undo">
          {{ t('pantry.remove.undo') }}
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>
