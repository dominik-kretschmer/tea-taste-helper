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
  throw createError({ statusCode, statusMessage: statusCode === 404 ? t('errors.NOT_FOUND') : error.value.statusMessage, fatal: true })
}

const ingredient = computed(() => data.value?.ingredient)
const text = useIngredientText(ingredient)

useHead({ title: () => text.value?.text.name ?? t('ingredients.title') })
</script>

<template>
  <v-row v-if="ingredient && text" justify="center">
    <v-col cols="12" md="10" lg="8">
      <h1 class="text-h4 mb-2 text-break">
        {{ text.text.name }}
      </h1>

      <v-alert v-if="!text.translated" type="info" variant="tonal" density="compact" class="mb-4">
        {{ t('ingredients.notTranslatedHint', { language: t(`language.${text.locale}`) }) }}
        <template v-if="loggedIn" #append>
          <v-btn
            variant="text"
            size="small"
            :prepend-icon="mdiTranslate"
            :to="localePath({ name: 'ingredients-id-edit', params: { id: ingredient.id }, query: { lang: locale } })"
          >
            {{ t('ingredients.translate') }}
          </v-btn>
        </template>
      </v-alert>

      <IngredientFacts :caffeine="ingredient.caffeine" :brew-temp-c="ingredient.brewTempC" :brew-seconds="ingredient.brewSeconds" class="mb-4" />

      <!-- Nur Text-Interpolation, nie v-html (AK-7.2); Zeilenumbrüche per CSS -->
      <p v-if="text.text.description" class="text-body-1 description mb-4">
        {{ text.text.description }}
      </p>
      <p v-else class="text-body-1 text-medium-emphasis mb-4">
        {{ t('ingredients.noDescription') }}
      </p>

      <p class="text-body-2 text-medium-emphasis mb-4">
        {{ t('ingredients.lastChanged', {
          date: formatDateTime(ingredient.updatedAt, locale),
          name: ingredient.updatedBy?.displayName ?? t('ingredients.deletedAccount'),
        }) }}
      </p>

      <div class="d-flex flex-wrap ga-2">
        <v-btn v-if="loggedIn" color="primary" :prepend-icon="mdiPencil" :to="localePath({ name: 'ingredients-id-edit', params: { id: ingredient.id } })">
          {{ t('ingredients.edit') }}
        </v-btn>
        <v-btn variant="outlined" :prepend-icon="mdiHistory" :to="localePath({ name: 'ingredients-id-history', params: { id: ingredient.id } })">
          {{ t('ingredients.history') }}
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
