<script setup lang="ts">
import { updateTeaSchema } from '#shared/schemas/tea'

definePageMeta({ middleware: 'auth' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { $api } = useNuxtApp()
const { fieldErrors, formError, validate, handleError, reset } = useFormErrors()

const id = computed(() => String(route.params.id))
const { data, error, refresh } = await useFetch<{ tea: TeaDetail }>(() => `/api/teas/${id.value}`)
if (error.value) {
  const statusCode = error.value.statusCode ?? 500
  throw createError({ statusCode, statusMessage: statusCode === 404 ? t('errors.NOT_FOUND') : error.value.statusMessage, fatal: true })
}

const tea = computed(() => data.value!.tea)
const existingLocales = computed(() => CONTENT_LOCALES.filter(code => tea.value.translations[code]))
const text = useCatalogText(tea)

useHead({ title: () => t('teas.editPage.title', { name: text.value?.text.name ?? '' }) })

// ?lang=en öffnet direkt diesen Tab; sonst die App-Sprache, falls übersetzt, sonst das Original
function initialTab(): ContentLocale {
  const requested = route.query.lang
  if (CONTENT_LOCALES.includes(requested as ContentLocale)) return requested as ContentLocale
  return tea.value.translations[locale.value as ContentLocale] ? locale.value as ContentLocale : tea.value.sourceLocale
}

// Die beim Laden gesehene Version wird mitgeschickt (optimistisches Sperren)
const loadedVersion = ref(tea.value.version)
const form = ref(teaFormFromDetail(tea.value, initialTab(), locale.value as ContentLocale))
const loading = ref(false)
/** gesetzt bei EDIT_CONFLICT; `version` ist die inzwischen aktuelle Version, falls bekannt */
const conflict = ref<{ version: number | null } | null>(null)
const duplicateId = ref<string | null>(null)
const noChanges = ref(false)
const confirmReload = ref(false)

// Zurück vom Anlegen einer fehlenden Zutat: Entwurf samt geladener Version wiederherstellen (AK-2.2)
onMounted(async () => {
  const draft = takeTeaDraft(id.value)
  if (draft) {
    form.value = draft.form
    if (draft.version) loadedVersion.value = draft.version
  }
  const added = route.query.addIngredient
  if (typeof added !== 'string') return
  await router.replace({ query: {} })
  if (form.value.ingredients.some(item => item.ingredientId === added)) return
  try {
    const { ingredient } = await $fetch<{ ingredient: IngredientDetail }>(`/api/ingredients/${added}`)
    form.value.ingredients.push({ ingredientId: added, name: pickTranslation(ingredient, locale.value as ContentLocale).text.name, percent: '' })
  }
  catch {
    // Zutat nicht mehr vorhanden – dann eben ohne sie weiter
  }
})

async function addMissingIngredient() {
  saveTeaDraft({ form: form.value, version: loadedVersion.value }, id.value)
  await navigateTo(localePath({ name: 'ingredients-new', query: { return: route.path } }))
}

async function submit() {
  duplicateId.value = null
  conflict.value = null
  noChanges.value = false
  const input = validate(updateTeaSchema, toUpdateTeaInput(form.value, loadedVersion.value, existingLocales.value))
  if (!input) return
  loading.value = true
  try {
    const response = await $api<{ tea: TeaDetail, changed: boolean }>(`/api/teas/${id.value}`, { method: 'PATCH', body: input })
    if (!response.changed) {
      noChanges.value = true
      return
    }
    await navigateTo(localePath({ name: 'teas-id', params: { id: id.value } }))
  }
  catch (err) {
    const { code, details } = handleError(err)
    if (code === 'EDIT_CONFLICT') {
      formError.value = null
      conflict.value = { version: (details as { currentVersion?: number } | undefined)?.currentVersion ?? null }
    }
    if (code === 'DUPLICATE_NAME') {
      formError.value = t('teas.errors.duplicate')
      duplicateId.value = (details as { teaId: string }).teaId
    }
  }
  finally {
    loading.value = false
  }
}

/** Verwirft die eigenen Eingaben und lädt die aktuelle Fassung. */
async function reloadCurrent() {
  confirmReload.value = false
  await refresh()
  loadedVersion.value = tea.value.version
  form.value = teaFormFromDetail(tea.value, form.value.locale, locale.value as ContentLocale)
  conflict.value = null
  reset()
}
</script>

<template>
  <v-row justify="center">
    <v-col cols="12" md="10" lg="8">
      <h1 class="text-h4 mb-6 text-break">
        {{ t('teas.editPage.title', { name: text?.text.name ?? '' }) }}
      </h1>
      <v-form @submit.prevent="submit">
        <v-alert v-if="conflict" type="warning" variant="tonal" class="mb-4">
          {{ conflict.version ? t('teas.editPage.conflict', { version: conflict.version }) : t('teas.editPage.conflictUnknown') }}
          <template #append>
            <v-btn variant="text" @click="confirmReload = true">
              {{ t('catalog.editPage.reload') }}
            </v-btn>
          </template>
        </v-alert>
        <v-alert v-if="formError" type="error" variant="tonal" class="mb-4">
          {{ formError }}
          <NuxtLink v-if="duplicateId" :to="localePath({ name: 'teas-id', params: { id: duplicateId } })" class="d-block mt-1">
            {{ t('teas.duplicateLink') }}
          </NuxtLink>
        </v-alert>
        <v-alert v-if="noChanges" type="info" variant="tonal" class="mb-4" :text="t('catalog.editPage.noChanges')" />

        <TeaForm
          v-model="form"
          mode="edit"
          :source-locale="tea.sourceLocale"
          :existing-locales="existingLocales"
          :field-errors="fieldErrors"
          @missing-ingredient="addMissingIngredient"
        />

        <div class="d-flex flex-wrap ga-2 mt-6">
          <v-btn type="submit" color="primary" size="large" :loading="loading">
            {{ t('catalog.editPage.save') }}
          </v-btn>
          <v-btn size="large" variant="text" :to="localePath({ name: 'teas-id', params: { id } })">
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
