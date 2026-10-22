<script setup lang="ts">
import { mdiEye, mdiEyeOff } from '@mdi/js'

defineProps<{ label: string, autocomplete: string, errorMessages?: string, hint?: string }>()
const model = defineModel<string>({ required: true })
const visible = ref(false)
const { t } = useI18n()
</script>

<template>
  <v-text-field
    v-model="model"
    :label="label"
    :type="visible ? 'text' : 'password'"
    :autocomplete="autocomplete"
    :error-messages="errorMessages"
    :hint="hint"
    :persistent-hint="!!hint"
  >
    <template #append-inner>
      <v-btn
        :icon="visible ? mdiEyeOff : mdiEye"
        :aria-label="visible ? t('form.hidePassword') : t('form.showPassword')"
        :aria-pressed="visible"
        variant="text"
        size="small"
        density="comfortable"
        @click="visible = !visible"
      />
    </template>
  </v-text-field>
</template>
