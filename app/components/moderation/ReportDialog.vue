<script setup lang="ts">
import { reportSchema } from '#shared/schemas/moderation'

// Eintrag melden (05 AK-2.1–2.4)
const props = defineProps<{ entityType: CatalogTypeValue, entityId: string }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const { $api } = useNuxtApp()
const { fieldErrors, formError, validate, handleError, reset } = useFormErrors()

const form = reactive({ reason: 'spam' as ReportReasonValue, comment: '', duplicateOfId: null as string | null })
const busy = ref(false)

// immediate: Der Dialog wird oft erst beim Öffnen eingebunden (v-if), dann ändert sich `open` nicht mehr
watch(open, (value) => {
  if (!value) return
  Object.assign(form, { reason: 'spam', comment: '', duplicateOfId: null })
  reset()
}, { immediate: true })

async function submit() {
  const input = validate(reportSchema, { entityType: props.entityType, entityId: props.entityId, ...form })
  if (!input) return
  busy.value = true
  try {
    await $api('/api/reports', { method: 'POST', body: input })
    open.value = false
    emit('done')
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
  <v-dialog v-model="open" max-width="520">
    <v-card :title="t('moderation.report.title')">
      <v-card-text>
        <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-4" :text="formError" />
        <v-radio-group v-model="form.reason" :label="t('moderation.report.reason')" hide-details class="mb-4">
          <v-radio v-for="reason in REPORT_REASONS" :key="reason" :value="reason" :label="t(`moderation.report.reasons.${reason}`)" />
        </v-radio-group>
        <ModerationEntrySearch
          v-if="form.reason === 'duplicate'"
          v-model="form.duplicateOfId"
          :entity-type="entityType"
          :exclude="entityId"
          :label="t('moderation.report.duplicateOf')"
          :error-messages="fieldErrors.duplicateOfId"
          class="mb-2"
        />
        <v-textarea
          v-model="form.comment"
          :label="form.reason === 'other' ? t('moderation.report.commentRequired') : t('moderation.report.comment')"
          :error-messages="fieldErrors.comment"
          :counter="MODERATION_TEXT_MAX"
          rows="3"
          auto-grow
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn color="primary" variant="flat" :loading="busy" @click="submit">
          {{ t('moderation.report.submit') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
