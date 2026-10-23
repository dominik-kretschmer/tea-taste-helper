<script setup lang="ts">
import { createTeaSchema } from '#shared/schemas/tea'

definePageMeta({ middleware: 'auth' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { $api } = useNuxtApp()
const { fieldErrors, formError, validate, handleError } = useFormErrors()

useHead({ title: () => t('teas.new.title') })

const form = ref(emptyTeaFormState(locale.value as ContentLocale))
const loading = ref(false)
const duplicateId = ref<string | null>(null)

// Zurück vom Anlegen einer fehlenden Zutat: Entwurf wiederherstellen und die neue Zutat anhängen (AK-2.2)
onMounted(async () => {
  const draft = takeTeaDraft()
  if (draft) form.value = draft.form
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
  saveTeaDraft({ form: form.value })
  await navigateTo(localePath({ name: 'ingredients-new', query: { return: route.path } }))
}

// Ähnliche öffentliche Tees nach kurzer Pause, nur wenn der Tee öffentlich werden soll (AK-2.3)
const similar = ref<{ id: string, name: string, brand: string | null }[]>([])
let debounce: ReturnType<typeof setTimeout> | undefined
watch(() => [form.value.translations[form.value.locale].name, form.value.visibility] as const, ([name, visibility]) => {
  clearTimeout(debounce)
  const trimmed = name.trim()
  if (visibility !== 'public' || trimmed.length < CATALOG_NAME_MIN) {
    similar.value = []
    return
  }
  debounce = setTimeout(async () => {
    try {
      const response = await $fetch<{ items: typeof similar.value }>('/api/teas/similar', { query: { name: trimmed, locale: locale.value } })
      similar.value = response.items
    }
    catch {
      similar.value = []
    }
  }, 400)
})

async function submit() {
  duplicateId.value = null
  const input = validate(createTeaSchema, toCreateTeaInput(form.value))
  if (!input) return
  loading.value = true
  try {
    const response = await $api<{ tea: TeaDetail }>('/api/teas', { method: 'POST', body: input })
    await navigateTo(localePath({ name: 'teas-id', params: { id: response.tea.id } }))
  }
  catch (error) {
    const { code, details } = handleError(error)
    if (code === 'DUPLICATE_NAME') {
      formError.value = t('teas.errors.duplicate')
      duplicateId.value = (details as { teaId: string }).teaId
    }
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <v-row justify="center">
    <v-col cols="12" md="10" lg="8">
      <h1 class="text-h4 mb-6">
        {{ t('teas.new.title') }}
      </h1>
      <v-form @submit.prevent="submit">
        <v-alert v-if="formError" type="error" variant="tonal" class="mb-4">
          {{ formError }}
          <NuxtLink v-if="duplicateId" :to="localePath({ name: 'teas-id', params: { id: duplicateId } })" class="d-block mt-1">
            {{ t('teas.duplicateLink') }}
          </NuxtLink>
        </v-alert>

        <TeaForm v-model="form" mode="create" :field-errors="fieldErrors" @missing-ingredient="addMissingIngredient">
          <template #after-name>
            <v-card v-if="similar.length" variant="tonal" color="info" class="mb-4">
              <v-card-subtitle class="pt-3 text-wrap">
                {{ t('teas.similar.title') }}
              </v-card-subtitle>
              <v-list density="compact" bg-color="transparent">
                <v-list-item
                  v-for="item in similar"
                  :key="item.id"
                  :title="item.name"
                  :subtitle="item.brand ?? undefined"
                  :to="localePath({ name: 'teas-id', params: { id: item.id } })"
                />
              </v-list>
            </v-card>
          </template>
        </TeaForm>

        <v-btn type="submit" color="primary" size="large" class="mt-6" :loading="loading">
          {{ t('teas.create') }}
        </v-btn>
      </v-form>
    </v-col>
  </v-row>
</template>
