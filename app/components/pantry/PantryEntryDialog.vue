<script setup lang="ts">
import { createPantrySchema, updatePantrySchema } from '#shared/schemas/pantry'

// Hinzufügen (Art, Suche, Menge) bzw. Menge ändern (06 AK-2.1–2.3, AK-2.5, AK-3.1)
const props = defineProps<{
  /** vorbelegte Art beim Hinzufügen (aktiver Tab) */
  type?: CatalogTypeValue
  /** Hinzufügen von der Detailseite: Eintrag steht fest */
  preset?: { entityType: CatalogTypeValue, entityId: string, name: string }
  /** Menge eines bestehenden Eintrags ändern */
  entry?: { id: string, name: string, grams: number | null }
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [entry: PantryRef] }>()

const { t } = useI18n()
const { $api } = useNuxtApp()
const { fieldErrors, formError, validate, handleError, reset } = useFormErrors()

const entityType = ref<CatalogTypeValue>('ingredient')
const entityId = ref<string | null>(null)
const grams = ref('')
/** gesetzt = Menge dieses Eintrags ändern (auch nach ALREADY_IN_PANTRY) */
const editId = ref<string | null>(null)
const existing = ref<{ entryId: string, grams: number | null } | null>(null)
const busy = ref(false)

// immediate: Der Dialog wird erst beim Öffnen eingebunden (v-if)
watch(open, (value) => {
  if (!value) return
  entityType.value = props.preset?.entityType ?? props.type ?? 'ingredient'
  entityId.value = props.preset?.entityId ?? null
  grams.value = props.entry?.grams == null ? '' : String(props.entry.grams)
  editId.value = props.entry?.id ?? null
  existing.value = null
  reset()
}, { immediate: true })

watch(entityType, () => {
  if (!props.preset) entityId.value = null
})

function editExisting() {
  if (!existing.value) return
  editId.value = existing.value.entryId
  grams.value = existing.value.grams == null ? '' : String(existing.value.grams)
  existing.value = null
  reset()
}

async function submit() {
  existing.value = null
  const amount = parseGrams(grams.value)
  try {
    busy.value = true
    let result: { entry: PantryRef }
    if (editId.value) {
      const input = validate(updatePantrySchema, { grams: amount })
      if (!input) return
      result = await $api<{ entry: PantryRef }>(`/api/pantry/${editId.value}`, { method: 'PATCH', body: input })
    }
    else {
      const input = validate(createPantrySchema, { entityType: entityType.value, entityId: entityId.value, grams: amount })
      if (!input) {
        if (!entityId.value) fieldErrors.value.entityId = t('validation.required')
        return
      }
      result = await $api<{ entry: PantryRef }>('/api/pantry', { method: 'POST', body: input })
    }
    open.value = false
    emit('saved', result.entry)
  }
  catch (err) {
    const { code, details } = handleError(err)
    if (code === 'ALREADY_IN_PANTRY') existing.value = details as { entryId: string, grams: number | null }
  }
  finally {
    busy.value = false
  }
}

const title = computed(() => (editId.value ? t('pantry.dialog.editTitle') : t('pantry.dialog.addTitle')))
const subtitle = computed(() => props.entry?.name ?? props.preset?.name)
</script>

<template>
  <v-dialog v-model="open" max-width="480">
    <v-card :title="title" :subtitle="subtitle">
      <v-card-text>
        <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-4" :text="formError">
          <template v-if="existing" #append>
            <v-btn variant="text" size="small" @click="editExisting">
              {{ t('pantry.dialog.editExisting') }}
            </v-btn>
          </template>
        </v-alert>
        <template v-if="!editId && !preset">
          <v-btn-toggle v-model="entityType" mandatory color="primary" variant="outlined" density="comfortable" class="mb-4" :aria-label="t('pantry.dialog.type')">
            <v-btn value="ingredient">
              {{ t('moderation.entryTypes.ingredient') }}
            </v-btn>
            <v-btn value="tea">
              {{ t('moderation.entryTypes.tea') }}
            </v-btn>
          </v-btn-toggle>
          <ModerationEntrySearch
            :key="entityType"
            v-model="entityId"
            :entity-type="entityType"
            :with-own="entityType === 'tea'"
            :label="t('pantry.dialog.search')"
            :error-messages="fieldErrors.entityId"
            class="mb-2"
          />
        </template>
        <v-text-field
          v-model="grams"
          type="number"
          inputmode="numeric"
          min="0"
          :max="PANTRY_GRAMS_MAX"
          step="1"
          suffix="g"
          :label="t('pantry.dialog.grams')"
          :hint="t('pantry.dialog.gramsHint')"
          persistent-hint
          :error-messages="fieldErrors.grams"
          @keydown.enter="submit"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn color="primary" variant="flat" :loading="busy" @click="submit">
          {{ t('pantry.dialog.save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
