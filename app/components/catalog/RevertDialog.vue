<script setup lang="ts">
// Auf eine ältere Version zurücksetzen, mit optionaler Notiz (05 AK-1.1, AK-1.3, AK-1.5)
const props = defineProps<{
  entityType: CatalogTypeValue
  entityId: string
  /** Zielversion */
  version: number
  /** aktuell geladene Version (Konfliktschutz) */
  currentVersion: number
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ done: [result: { changed: boolean, version: number }], reload: [] }>()

const { t } = useI18n()
const localePath = useLocalePath()
const { $api } = useNuxtApp()
const { formError, handleError, reset } = useFormErrors()

const note = ref('')
const busy = ref(false)
const conflict = ref(false)
const link = ref<{ name: string, id: string, text: string } | null>(null)

watch(open, (value) => {
  if (!value) return
  note.value = ''
  conflict.value = false
  link.value = null
  reset()
})

async function submit() {
  busy.value = true
  conflict.value = false
  link.value = null
  try {
    const response = await $api<{ changed: boolean, ingredient?: { version: number }, tea?: { version: number } }>(
      `/api/${entityApiSegment(props.entityType)}/${props.entityId}/revert`,
      { method: 'POST', body: { version: props.currentVersion, to: props.version, note: note.value } },
    )
    open.value = false
    emit('done', { changed: response.changed, version: (response.ingredient ?? response.tea)!.version })
  }
  catch (err) {
    const { code, details } = handleError(err)
    const info = (details ?? {}) as { ingredientId?: string, teaId?: string }
    if (code === 'EDIT_CONFLICT') {
      conflict.value = true
      formError.value = t('moderation.revert.conflict')
    }
    else if (code === 'DUPLICATE_NAME') {
      formError.value = t('moderation.revert.duplicate')
      const id = info.ingredientId ?? info.teaId
      if (id) link.value = { name: entityRouteName(props.entityType), id, text: t('moderation.revert.duplicateLink') }
    }
    else if (code === 'INGREDIENT_UNAVAILABLE' && info.ingredientId) {
      formError.value = t('moderation.revert.unavailable')
      link.value = { name: 'ingredients-id', id: info.ingredientId, text: t('moderation.revert.unavailableLink') }
    }
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="480">
    <v-card :title="t('moderation.revert.title', { version })">
      <v-card-text>
        <p class="mb-4">
          {{ t('moderation.revert.text', { version }) }}
        </p>
        <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-4">
          {{ formError }}
          <NuxtLink v-if="link" :to="localePath({ name: link.name, params: { id: link.id } })" class="d-block">
            {{ link.text }}
          </NuxtLink>
          <template v-if="conflict" #append>
            <v-btn variant="text" size="small" @click="open = false; emit('reload')">
              {{ t('moderation.revert.reload') }}
            </v-btn>
          </template>
        </v-alert>
        <v-text-field v-model="note" :label="t('moderation.revert.note')" :counter="CATALOG_NOTE_MAX" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn color="primary" variant="flat" :loading="busy" @click="submit">
          {{ t('moderation.revert.action') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
