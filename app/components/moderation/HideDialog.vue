<script setup lang="ts">
import { hideSchema } from '#shared/schemas/moderation'

// Eintrag ausblenden mit Grund (05 AK-5.1, AK-5.2, AK-9.3)
const props = defineProps<{ entityType: CatalogTypeValue, entityId: string }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ done: [], merge: [] }>()

const { t } = useI18n()
const { $api } = useNuxtApp()
const { fieldErrors, formError, validate, handleError, reset } = useFormErrors()

const reason = ref('')
const inUse = ref<number | null>(null)
const busy = ref(false)

// immediate: Der Dialog wird oft erst beim Öffnen eingebunden (v-if), dann ändert sich `open` nicht mehr
watch(open, (value) => {
  if (!value) return
  reason.value = ''
  inUse.value = null
  reset()
}, { immediate: true })

async function submit() {
  const input = validate(hideSchema, { reason: reason.value })
  if (!input) return
  busy.value = true
  inUse.value = null
  try {
    await $api(`/api/admin/${entityApiSegment(props.entityType)}/${props.entityId}/hide`, { method: 'POST', body: input })
    open.value = false
    emit('done')
  }
  catch (err) {
    const { code, details } = handleError(err)
    if (code === 'INGREDIENT_IN_USE') {
      inUse.value = (details as { teas: number }).teas
      formError.value = null
    }
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="480">
    <v-card :title="t('moderation.hide.title')" :subtitle="t(`moderation.entryTypes.${entityType}`)">
      <v-card-text>
        <p class="mb-4">
          {{ t('moderation.hide.text') }}
        </p>
        <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-4" :text="formError" />
        <v-alert v-if="inUse !== null" type="warning" variant="tonal" density="compact" class="mb-4">
          {{ t('moderation.hide.inUse', { count: inUse }) }}
          <template #append>
            <v-btn variant="text" size="small" @click="open = false; emit('merge')">
              {{ t('moderation.merge.menu') }}
            </v-btn>
          </template>
        </v-alert>
        <v-textarea v-model="reason" :label="t('moderation.hide.reason')" :error-messages="fieldErrors.reason" :counter="MODERATION_TEXT_MAX" rows="2" auto-grow />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn color="error" variant="flat" :loading="busy" @click="submit">
          {{ t('moderation.hide.action') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
