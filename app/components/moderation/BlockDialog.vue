<script setup lang="ts">
import { blockSchema } from '#shared/schemas/moderation'

// Nutzer sperren bzw. bestehende Sperre ändern (05 AK-6.1, AK-6.8, AK-9.3)
const props = defineProps<{ user: { id: string, displayName: string, blocked?: boolean, blockReason?: string | null } }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ done: [user: ModerationUser] }>()

const { t } = useI18n()
const { $api } = useNuxtApp()
const { fieldErrors, formError, validate, handleError, reset } = useFormErrors()

const form = reactive({ duration: '7d' as BlockDuration, reason: '' })
const busy = ref(false)

// immediate: Der Dialog wird oft erst beim Öffnen eingebunden (v-if), dann ändert sich `open` nicht mehr
watch(open, (value) => {
  if (!value) return
  form.duration = '7d'
  form.reason = props.user.blocked ? (props.user.blockReason ?? '') : ''
  reset()
}, { immediate: true })

async function submit() {
  const input = validate(blockSchema, form)
  if (!input) return
  busy.value = true
  try {
    const response = await $api<{ user: ModerationUser }>(`/api/admin/users/${props.user.id}/block`, { method: 'POST', body: input })
    open.value = false
    emit('done', response.user)
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
  <v-dialog v-model="open" max-width="480">
    <v-card :title="t(user.blocked ? 'moderation.block.titleChange' : 'moderation.block.title', { name: user.displayName })">
      <v-card-text>
        <p class="mb-4">
          {{ t('moderation.block.text') }}
        </p>
        <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-4" :text="formError" />
        <v-radio-group v-model="form.duration" :label="t('moderation.block.duration')" hide-details class="mb-4">
          <v-radio v-for="duration in BLOCK_DURATIONS" :key="duration" :value="duration" :label="t(`moderation.block.durations.${duration}`)" />
        </v-radio-group>
        <v-textarea v-model="form.reason" :label="t('moderation.block.reason')" :error-messages="fieldErrors.reason" :counter="MODERATION_TEXT_MAX" rows="2" auto-grow />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn color="error" variant="flat" :loading="busy" @click="submit">
          {{ t('moderation.block.action') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
