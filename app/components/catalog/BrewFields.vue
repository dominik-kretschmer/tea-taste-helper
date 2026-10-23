<script setup lang="ts">
import { mdiCoffeeOffOutline, mdiCoffeeOutline, mdiHelpCircleOutline } from '@mdi/js'
import { BREW_SECONDS_MAX, BREW_SECONDS_MIN, BREW_TEMP_MAX, BREW_TEMP_MIN } from '#shared/utils/catalog'

// Koffein, Wassertemperatur und Ziehzeit (als „m:ss“).
const props = defineProps<{ fieldErrors: Record<string, string> }>()

const caffeine = defineModel<CaffeineValue>('caffeine', { required: true })
const brewTempC = defineModel<string>('brewTempC', { required: true })
const brewTime = defineModel<string>('brewTime', { required: true })

const { t } = useI18n()

const caffeineOptions = [
  { value: 'yes', icon: mdiCoffeeOutline },
  { value: 'no', icon: mdiCoffeeOffOutline },
  { value: 'unknown', icon: mdiHelpCircleOutline },
] as const

// Unlesbare Ziehzeit (NaN) meldet zod nur als „ungültig“ – hier mit Formatbeispiel
const brewTimeError = computed(() => {
  const error = props.fieldErrors.brewSeconds
  return error && Number.isNaN(parseDuration(brewTime.value)) ? t('validation.duration') : error
})

const brewTempHint = `${BREW_TEMP_MIN} – ${BREW_TEMP_MAX}`
const brewTimeHint = `${formatDuration(BREW_SECONDS_MIN)} – ${formatDuration(BREW_SECONDS_MAX)}`
</script>

<template>
  <div>
    <p class="text-subtitle-2 mb-2">
      {{ t('catalog.fields.caffeine') }}
    </p>
    <v-btn-toggle
      v-model="caffeine"
      mandatory
      variant="outlined"
      density="comfortable"
      divided
      class="mb-6 flex-wrap h-auto"
      :aria-label="t('catalog.fields.caffeine')"
    >
      <v-btn v-for="option in caffeineOptions" :key="option.value" :value="option.value" :prepend-icon="option.icon">
        {{ t(`catalog.caffeineOptions.${option.value}`) }}
      </v-btn>
    </v-btn-toggle>

    <v-row density="compact">
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="brewTempC"
          :label="t('catalog.fields.brewTempC')"
          type="number"
          inputmode="numeric"
          :hint="brewTempHint"
          persistent-hint
          :error-messages="fieldErrors.brewTempC"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="brewTime"
          :label="t('catalog.fields.brewTime')"
          placeholder="3:30"
          :hint="brewTimeHint"
          persistent-hint
          :error-messages="brewTimeError"
        />
      </v-col>
    </v-row>
  </div>
</template>
