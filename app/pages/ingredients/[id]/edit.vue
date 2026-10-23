<script setup lang="ts">
import { updateIngredientSchema } from '#shared/schemas/ingredient'

definePageMeta({ middleware: 'auth' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { $api } = useNuxtApp()
const { fieldErrors, formError, validate, handleError, reset } = useFormErrors()

const id = computed(() => String(route.params.id))
const { data, error, refresh } = await useFetch<{ ingredient: IngredientDetail }>(() => `/api/ingredients/${id.value}`)
if (error.value) {
  const statusCode = error.value.statusCode ?? 500
  throw createError({ statusCode, statusMessage: statusCode === 404 ? t('errors.NOT_FOUND') : error.value.statusMessage, fatal: true })
}

const ingredient = computed(() => data.value!.ingredient)
const existingLocales = computed(() => CONTENT_LOCALES.filter(code => ingredient.value.translations[code]))
const text = useIngredientText(ingredient)

useHead({ title: () => t('ingredients.editPage.title', { name: text.value?.text.name ?? '' }) })

// ?lang=en öffnet direkt diesen Tab; sonst die App-Sprache, falls übersetzt, sonst das Original
function initialTab(): ContentLocale {
  const requested = route.query.lang
  if (CONTENT_LOCALES.includes(requested as ContentLocale)) return requested as ContentLocale
  return ingredient.value.translations[locale.value as ContentLocale] ? locale.value as ContentLocale : ingredient.value.sourceLocale
}

// Die beim Laden gesehene Version wird mitgeschickt (optimistisches Sperren, AK-3.2)
const loadedVersion = ref(ingredient.value.version)
const form = ref(formStateFromDetail(ingredient.value, initialTab()))
const loading = ref(false)
/** gesetzt bei EDIT_CONFLICT; `version` ist die inzwischen aktuelle Version, falls bekannt */
const conflict = ref<{ version: number | null } | null>(null)
const duplicateId = ref<string | null>(null)
const noChanges = ref(false)
const confirmReload = ref(false)

async function submit() {
  duplicateId.value = null
  conflict.value = null
  noChanges.value = false
  const input = validate(updateIngredientSchema, toUpdateInput(form.value, loadedVersion.value, existingLocales.value))
  if (!input) return
  loading.value = true
  try {
    const response = await $api<{ ingredient: IngredientDetail, changed: boolean }>(`/api/ingredients/${id.value}`, { method: 'PATCH', body: input })
    if (!response.changed) {
      noChanges.value = true
      return
    }
    await navigateTo(localePath({ name: 'ingredients-id', params: { id: id.value } }))
  }
  catch (error) {
    const { code, details } = handleError(error)
    if (code === 'EDIT_CONFLICT') {
      formError.value = null
      conflict.value = { version: (details as { currentVersion?: number } | undefined)?.currentVersion ?? null }
    }
    if (code === 'DUPLICATE_NAME') duplicateId.value = (details as { ingredientId: string }).ingredientId
  }
  finally {
    loading.value = false
  }
}

/** Verwirft die eigenen Eingaben und lädt die aktuelle Fassung. */
async function reloadCurrent() {
  confirmReload.value = false
  await refresh()
  const tab = form.value.locale
  loadedVersion.value = ingredient.value.version
  form.value = formStateFromDetail(ingredient.value, tab)
  conflict.value = null
  reset()
}
</script>

<template>
  <v-row justify="center">
    <v-col cols="12" md="10" lg="8">
      <h1 class="text-h4 mb-6 text-break">
        {{ t('ingredients.editPage.title', { name: text?.text.name ?? '' }) }}
      </h1>
      <v-form @submit.prevent="submit">
        <v-alert v-if="conflict" type="warning" variant="tonal" class="mb-4">
          {{ conflict.version ? t('ingredients.editPage.conflict', { version: conflict.version }) : t('errors.EDIT_CONFLICT') }}
          <template #append>
            <v-btn variant="text" @click="confirmReload = true">
              {{ t('catalog.editPage.reload') }}
            </v-btn>
          </template>
        </v-alert>
        <v-alert v-if="formError" type="error" variant="tonal" class="mb-4">
          {{ formError }}
          <NuxtLink v-if="duplicateId" :to="localePath({ name: 'ingredients-id', params: { id: duplicateId } })" class="d-block mt-1">
            {{ t('ingredients.duplicateLink') }}
          </NuxtLink>
        </v-alert>
        <v-alert v-if="noChanges" type="info" variant="tonal" class="mb-4" :text="t('catalog.editPage.noChanges')" />

        <IngredientForm
          v-model="form"
          mode="edit"
          :source-locale="ingredient.sourceLocale"
          :existing-locales="existingLocales"
          :field-errors="fieldErrors"
        />

        <div class="d-flex flex-wrap ga-2 mt-6">
          <v-btn type="submit" color="primary" size="large" :loading="loading">
            {{ t('catalog.editPage.save') }}
          </v-btn>
          <v-btn size="large" variant="text" :to="localePath({ name: 'ingredients-id', params: { id } })">
            {{ t('common.cancel') }}
          </v-btn>
        </div>
      </v-form>

      <v-dialog v-model="confirmReload" max-width="420">
        <v-card :title="t('catalog.editPage.reload')" :text="t('catalog.editPage.reloadConfirm')">
          <v-card-actions>
            <v-spacer />
            <v-btn @click="confirmReload = false">
              {{ t('common.cancel') }}
            </v-btn>
            <v-btn color="warning" variant="flat" @click="reloadCurrent">
              {{ t('catalog.editPage.reload') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-col>
  </v-row>
</template>
