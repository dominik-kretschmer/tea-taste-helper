<script setup lang="ts">
import { createIngredientSchema } from '#shared/schemas/ingredient'

definePageMeta({ middleware: 'auth' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { $api } = useNuxtApp()
const { fieldErrors, formError, validate, handleError } = useFormErrors()

useHead({ title: () => t('ingredients.new.title') })

const form = ref(emptyFormState(locale.value as ContentLocale))
const loading = ref(false)
const duplicateId = ref<string | null>(null)

// Ähnliche Zutaten nach kurzer Pause (AK-2.2)
const similar = ref<{ id: string, name: string }[]>([])
let debounce: ReturnType<typeof setTimeout> | undefined
watch(() => [form.value.translations[form.value.locale].name, form.value.locale] as const, ([name]) => {
  clearTimeout(debounce)
  const trimmed = name.trim()
  if (trimmed.length < CATALOG_NAME_MIN) {
    similar.value = []
    return
  }
  debounce = setTimeout(async () => {
    try {
      const response = await $fetch<{ items: { id: string, name: string }[] }>('/api/ingredients/similar', {
        query: { name: trimmed, locale: locale.value },
      })
      similar.value = response.items
    }
    catch {
      similar.value = []
    }
  }, 400)
})

async function submit() {
  duplicateId.value = null
  const input = validate(createIngredientSchema, toCreateInput(form.value))
  if (!input) return
  loading.value = true
  try {
    const response = await $api<{ ingredient: IngredientDetail }>('/api/ingredients', { method: 'POST', body: input })
    // Aus dem Tee-Formular gekommen („Zutat fehlt“): zurück dorthin, die neue Zutat wird angehängt (04, AK-2.2)
    const back = safeRedirect(route.query.return, '')
    if (back) await navigateTo({ path: back, query: { addIngredient: response.ingredient.id } })
    else await navigateTo(localePath({ name: 'ingredients-id', params: { id: response.ingredient.id } }))
  }
  catch (error) {
    const { code, details } = handleError(error)
    if (code === 'DUPLICATE_NAME') duplicateId.value = (details as { ingredientId: string }).ingredientId
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
        {{ t('ingredients.new.title') }}
      </h1>
      <v-form @submit.prevent="submit">
        <v-alert v-if="formError" type="error" variant="tonal" class="mb-4">
          {{ formError }}
          <NuxtLink v-if="duplicateId" :to="localePath({ name: 'ingredients-id', params: { id: duplicateId } })" class="d-block mt-1">
            {{ t('ingredients.duplicateLink') }}
          </NuxtLink>
        </v-alert>

        <IngredientForm v-model="form" mode="create" :field-errors="fieldErrors">
          <template #after-name>
            <v-card v-if="similar.length" variant="tonal" color="info" class="mb-4">
              <v-card-subtitle class="pt-3 text-wrap">
                {{ t('ingredients.similar.title') }}
              </v-card-subtitle>
              <v-list density="compact" bg-color="transparent">
                <v-list-item
                  v-for="item in similar"
                  :key="item.id"
                  :title="item.name"
                  :to="localePath({ name: 'ingredients-id', params: { id: item.id } })"
                />
              </v-list>
            </v-card>
          </template>
        </IngredientForm>

        <v-btn type="submit" color="primary" size="large" class="mt-6" :loading="loading">
          {{ t('ingredients.create') }}
        </v-btn>
      </v-form>
    </v-col>
  </v-row>
</template>
