<script setup lang="ts">
import { mdiHistory, mdiPencil, mdiTranslate } from '@mdi/js'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { loggedIn } = useAuth()

const id = computed(() => String(route.params.id))
const { data, error } = await useFetch<{ ingredient: IngredientDetail }>(() => `/api/ingredients/${id.value}`)
if (error.value) {
  const statusCode = error.value.statusCode ?? 500
  // Titel und Text übersetzt die Fehlerseite selbst (app/error.vue)
  throw createError({ statusCode, fatal: true })
}

const ingredient = computed(() => data.value?.ingredient)
const text = useIngredientText(ingredient)

useHead({ title: () => text.value?.text.name ?? t('ingredients.title') })

// Öffentliche Tees mit dieser Zutat (04, AK-8.1); private erscheinen hier nie
const CONTAINED_IN_LIMIT = 10
const { data: teas } = await useFetch<Page<TeaListItem>>('/api/teas', {
  query: computed(() => ({ ingredient: id.value, locale: locale.value })),
})
</script>

<template>
  <v-row v-if="ingredient && text" justify="center">
    <v-col cols="12" md="10" lg="8">
      <h1 class="text-h4 mb-2 text-break">
        {{ text.text.name }}
      </h1>

      <v-alert v-if="!text.translated" type="info" variant="tonal" density="compact" class="mb-4">
        {{ t('catalog.notTranslatedHint', { language: t(`language.${text.locale}`) }) }}
        <template v-if="loggedIn" #append>
          <v-btn
            variant="text"
            size="small"
            :prepend-icon="mdiTranslate"
            :to="localePath({ name: 'ingredients-id-edit', params: { id: ingredient.id }, query: { lang: locale } })"
          >
            {{ t('catalog.translate') }}
          </v-btn>
        </template>
      </v-alert>

      <CatalogFactChips :caffeine="ingredient.caffeine" :brew-temp-c="ingredient.brewTempC" :brew-seconds="ingredient.brewSeconds" class="mb-4" />

      <!-- Nur Text-Interpolation, nie v-html (AK-7.2); Zeilenumbrüche per CSS -->
      <p v-if="text.text.description" class="text-body-1 description mb-4">
        {{ text.text.description }}
      </p>
      <p v-else class="text-body-1 text-medium-emphasis mb-4">
        {{ t('catalog.noDescription') }}
      </p>

      <p class="text-body-2 text-medium-emphasis mb-4">
        {{ t('catalog.lastChanged', {
          date: formatDateTime(ingredient.updatedAt, locale),
          name: ingredient.updatedBy?.displayName ?? t('catalog.deletedAccount'),
        }) }}
      </p>

      <h2 class="text-h6 mb-1">
        {{ t('teas.containedIn.title') }}
      </h2>
      <p v-if="!teas?.items.length" class="text-body-2 text-medium-emphasis mb-4">
        {{ t('teas.containedIn.empty') }}
      </p>
      <v-list v-else density="compact" class="py-0 mb-4">
        <v-list-item
          v-for="item in teas.items.slice(0, CONTAINED_IN_LIMIT)"
          :key="item.id"
          :title="item.name"
          :subtitle="item.brand ?? undefined"
          :to="localePath({ name: 'teas-id', params: { id: item.id } })"
          class="px-0"
        />
        <v-list-item
          v-if="teas.total > CONTAINED_IN_LIMIT"
          :title="t('teas.containedIn.all', { total: teas.total })"
          :to="localePath({ name: 'teas', query: { ingredient: ingredient.id } })"
          class="px-0 text-primary"
        />
      </v-list>

      <div class="d-flex flex-wrap ga-2">
        <v-btn v-if="loggedIn" color="primary" :prepend-icon="mdiPencil" :to="localePath({ name: 'ingredients-id-edit', params: { id: ingredient.id } })">
          {{ t('catalog.edit') }}
        </v-btn>
        <v-btn variant="outlined" :prepend-icon="mdiHistory" :to="localePath({ name: 'ingredients-id-history', params: { id: ingredient.id } })">
          {{ t('catalog.history') }}
        </v-btn>
      </div>
    </v-col>
  </v-row>
</template>

<style scoped>
.description {
  white-space: pre-line;
  overflow-wrap: anywhere;
}
</style>
