<script setup lang="ts">
// Duplikat in einen anderen Eintrag zusammenführen: Ziel wählen, Vorschau, Bestätigung (05 AK-4.1, AK-4.5, AK-4.6)
const props = defineProps<{ entityType: CatalogTypeValue, sourceId: string, initialTarget?: string | null }>()
const open = defineModel<boolean>({ required: true })

const { t } = useI18n()
const localePath = useLocalePath()
const { $api } = useNuxtApp()
const { formError, handleError, reset } = useFormErrors()

const targetId = ref<string | null>(null)
const preview = ref<MergePreview | null>(null)
const loading = ref(false)
const confirmed = ref(false)
const busy = ref(false)

watch(open, (value) => {
  if (!value) return
  targetId.value = props.initialTarget ?? null
  preview.value = null
  confirmed.value = false
  reset()
})

watch(targetId, async (id) => {
  preview.value = null
  confirmed.value = false
  formError.value = null
  if (!id) return
  loading.value = true
  try {
    preview.value = await $fetch<MergePreview>(`/api/admin/${entityApiSegment(props.entityType)}/${props.sourceId}/merge`, { query: { target: id } })
  }
  catch (err) {
    handleError(err)
  }
  finally {
    loading.value = false
  }
})

const nameOf = (entry: { sourceLocale: ContentLocale, translations: CatalogTranslations }, locale: ContentLocale) => entry.translations[locale]?.name
const languages = computed(() => preview.value?.missingTranslations.map(locale => t(`language.${locale}`)).join(', ') ?? '')

async function submit() {
  if (!targetId.value) return
  busy.value = true
  try {
    await $api(`/api/admin/${entityApiSegment(props.entityType)}/${props.sourceId}/merge`, { method: 'POST', body: { targetId: targetId.value } })
    open.value = false
    await navigateTo(localePath({ name: entityRouteName(props.entityType), params: { id: targetId.value }, query: { mergedFrom: props.sourceId } }))
  }
  catch (err) {
    handleError(err)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="720" scrollable>
    <v-card :title="t('moderation.merge.title')" :subtitle="t(`moderation.entryTypes.${entityType}`)">
      <v-card-text>
        <ModerationEntrySearch v-model="targetId" :entity-type="entityType" :exclude="sourceId" :label="t('moderation.merge.target')" />
        <v-progress-linear v-if="loading" indeterminate class="mb-2" />
        <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-4" :text="formError" />

        <template v-if="preview">
          <v-row density="compact" class="mb-2">
            <v-col v-for="side in (['source', 'target'] as const)" :key="side" cols="12" sm="6">
              <v-card variant="outlined" class="h-100">
                <v-card-subtitle class="pt-3">
                  {{ t(`moderation.merge.${side}`) }}
                </v-card-subtitle>
                <v-card-text>
                  <div v-for="locale in CONTENT_LOCALES" :key="locale" class="text-break">
                    <span class="text-medium-emphasis">{{ t(`language.${locale}`) }}:</span>
                    {{ nameOf(preview[side], locale) ?? '–' }}
                  </div>
                  <CatalogFactChips :caffeine="preview[side].caffeine" :brew-temp-c="preview[side].brewTempC" :brew-seconds="preview[side].brewSeconds" class="mt-2" />
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
          <p v-if="preview.teas" class="mb-2">
            {{ t('moderation.merge.teas', { public: preview.teas.public, private: preview.teas.private }) }}
          </p>
          <v-alert v-if="preview.missingTranslations.length" type="info" variant="tonal" density="compact" class="mb-2">
            {{ t('moderation.merge.missingTranslations', { languages }) }}
            <template #append>
              <v-btn variant="text" size="small" :to="localePath({ name: entityRouteName(entityType, 'edit'), params: { id: preview.target.id } })">
                {{ t('moderation.merge.editTarget') }}
              </v-btn>
            </template>
          </v-alert>
          <v-checkbox v-model="confirmed" :label="t('moderation.merge.confirm')" hide-details />
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn color="error" variant="flat" :disabled="!preview || !confirmed" :loading="busy" @click="submit">
          {{ t('moderation.merge.action') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
