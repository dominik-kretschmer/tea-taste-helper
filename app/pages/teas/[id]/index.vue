<script setup lang="ts">
import { mdiDeleteOutline, mdiEarth, mdiHistory, mdiLockOutline, mdiPencil, mdiTranslate } from '@mdi/js'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { loggedIn } = useAuth()
const { $api } = useNuxtApp()
const { formError, handleError } = useFormErrors()

const id = computed(() => String(route.params.id))
const { data, error, refresh } = await useFetch<{ tea: TeaDetail }>(() => `/api/teas/${id.value}`)
if (error.value) {
  const statusCode = error.value.statusCode ?? 500
  throw createError({ statusCode, statusMessage: statusCode === 404 ? t('errors.NOT_FOUND') : error.value.statusMessage, fatal: true })
}

const tea = computed(() => data.value?.tea)
const text = useCatalogText(tea)
const isPrivate = computed(() => tea.value?.visibility === 'private')
// Private Tees sieht nur der Ersteller; öffentliche bearbeiten alle Angemeldeten (AK-3.1, AK-3.2)
const canEdit = computed(() => loggedIn.value && (!isPrivate.value || tea.value?.isOwner))
const showCaffeineHint = computed(() => tea.value?.caffeine === 'unknown' && tea.value.ingredientsCaffeinated)

useHead({ title: () => text.value?.text.name ?? t('teas.title') })

const dialog = ref<'publish' | 'delete' | null>(null)
const busy = ref(false)
const duplicateId = ref<string | null>(null)
const published = ref(false)

async function publish() {
  if (!tea.value) return
  busy.value = true
  formError.value = null
  duplicateId.value = null
  try {
    await $api(`/api/teas/${id.value}/publish`, { method: 'POST', body: { version: tea.value.version } })
    await refresh()
    published.value = true
  }
  catch (err) {
    const { code, details } = handleError(err)
    if (code === 'DUPLICATE_NAME') duplicateId.value = (details as { teaId: string }).teaId
    // Inzwischen geändert: aktuelle Fassung laden, der Nutzer kann es erneut versuchen
    if (code === 'EDIT_CONFLICT') await refresh()
  }
  finally {
    busy.value = false
    dialog.value = null
  }
}

async function remove() {
  busy.value = true
  formError.value = null
  try {
    await $api(`/api/teas/${id.value}`, { method: 'DELETE' })
    await navigateTo(localePath({ name: 'teas', query: { mine: '1' } }))
  }
  catch (err) {
    handleError(err)
    dialog.value = null
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <v-row v-if="tea && text" justify="center">
    <v-col cols="12" md="10" lg="8">
      <h1 class="text-h4 mb-2 text-break">
        {{ text.text.name }}
      </h1>

      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-chip v-if="isPrivate" :prepend-icon="mdiLockOutline" size="small" variant="outlined">
          {{ t('teas.visibility.private') }}
        </v-chip>
        <v-chip size="small" variant="tonal">
          {{ t(`teas.kind.${tea.kind}`) }}
        </v-chip>
        <v-chip v-if="tea.brand" size="small" variant="tonal">
          {{ tea.brand }}
        </v-chip>
      </div>

      <v-alert v-if="formError" type="error" variant="tonal" class="mb-4">
        {{ formError }}
        <NuxtLink v-if="duplicateId" :to="localePath({ name: 'teas-id', params: { id: duplicateId } })" class="d-block mt-1">
          {{ t('teas.duplicateLink') }}
        </NuxtLink>
      </v-alert>
      <v-alert v-if="published" type="success" variant="tonal" class="mb-4" :text="t('teas.publish.done')" />

      <v-alert v-if="!text.translated" type="info" variant="tonal" density="compact" class="mb-4">
        {{ t('catalog.notTranslatedHint', { language: t(`language.${text.locale}`) }) }}
        <template v-if="canEdit" #append>
          <v-btn
            variant="text"
            size="small"
            :prepend-icon="mdiTranslate"
            :to="localePath({ name: 'teas-id-edit', params: { id: tea.id }, query: { lang: locale } })"
          >
            {{ t('catalog.translate') }}
          </v-btn>
        </template>
      </v-alert>

      <CatalogFactChips :caffeine="tea.caffeine" :brew-temp-c="tea.brewTempC" :brew-seconds="tea.brewSeconds" class="mb-2" />
      <p v-if="showCaffeineHint" class="text-body-2 text-medium-emphasis mb-4">
        {{ t('teas.caffeineHint') }}
      </p>

      <!-- Nur Text-Interpolation, nie v-html (AK-10.2); Zeilenumbrüche per CSS -->
      <p v-if="text.text.description" class="text-body-1 description my-4">
        {{ text.text.description }}
      </p>
      <p v-else class="text-body-1 text-medium-emphasis my-4">
        {{ t('catalog.noDescription') }}
      </p>

      <h2 class="text-h6 mb-1">
        {{ t('teas.fields.ingredients') }}
      </h2>
      <TeaIngredientsList :ingredients="tea.ingredients" class="mb-4" />

      <p class="text-body-2 text-medium-emphasis mb-4">
        {{ t('teas.createdBy', { name: tea.owner?.displayName ?? t('catalog.deletedAccount') }) }} ·
        {{ t('catalog.lastChanged', {
          date: formatDateTime(tea.updatedAt, locale),
          name: tea.updatedBy?.displayName ?? t('catalog.deletedAccount'),
        }) }}
      </p>

      <div class="d-flex flex-wrap ga-2">
        <v-btn v-if="canEdit" color="primary" :prepend-icon="mdiPencil" :to="localePath({ name: 'teas-id-edit', params: { id: tea.id } })">
          {{ t('catalog.edit') }}
        </v-btn>
        <v-btn variant="outlined" :prepend-icon="mdiHistory" :to="localePath({ name: 'teas-id-history', params: { id: tea.id } })">
          {{ t('catalog.history') }}
        </v-btn>
        <template v-if="tea.isOwner && isPrivate">
          <v-btn variant="outlined" color="primary" :prepend-icon="mdiEarth" @click="dialog = 'publish'">
            {{ t('teas.publish.action') }}
          </v-btn>
          <v-btn variant="text" color="error" :prepend-icon="mdiDeleteOutline" @click="dialog = 'delete'">
            {{ t('teas.delete.action') }}
          </v-btn>
        </template>
      </div>

      <v-dialog :model-value="!!dialog" max-width="440" @update:model-value="dialog = null">
        <v-card v-if="dialog" :title="t(`teas.${dialog}.title`)" :text="t(`teas.${dialog}.text`)">
          <v-card-actions>
            <v-spacer />
            <v-btn @click="dialog = null">
              {{ t('common.cancel') }}
            </v-btn>
            <v-btn
              :color="dialog === 'delete' ? 'error' : 'primary'"
              variant="flat"
              :loading="busy"
              @click="dialog === 'delete' ? remove() : publish()"
            >
              {{ t(`teas.${dialog}.action`) }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-col>
  </v-row>
</template>

<style scoped>
.description {
  white-space: pre-line;
  overflow-wrap: anywhere;
}
</style>
