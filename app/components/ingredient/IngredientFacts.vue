<script setup lang="ts">
import { mdiCoffeeOffOutline, mdiCoffeeOutline, mdiHelpCircleOutline, mdiThermometer, mdiTimerOutline } from '@mdi/js'

const props = defineProps<{
  caffeine: CaffeineValue
  brewTempC?: number | null
  brewSeconds?: number | null
  /** nur den Koffein-Chip zeigen (Listen) */
  compact?: boolean
}>()

const { t } = useI18n()

const caffeineChip = computed(() => ({
  yes: { icon: mdiCoffeeOutline, color: 'brown' },
  no: { icon: mdiCoffeeOffOutline, color: 'success' },
  unknown: { icon: mdiHelpCircleOutline, color: undefined },
})[props.caffeine])
</script>

<template>
  <div class="d-flex flex-wrap ga-2 align-center">
    <v-chip :prepend-icon="caffeineChip.icon" :color="caffeineChip.color" size="small" variant="tonal">
      {{ t(`ingredients.caffeine.${caffeine}`) }}
    </v-chip>
    <template v-if="!compact">
      <v-chip v-if="brewTempC != null" :prepend-icon="mdiThermometer" size="small" variant="tonal">
        {{ t('ingredients.brew.temp', { temp: brewTempC }) }}
      </v-chip>
      <v-chip v-if="brewSeconds != null" :prepend-icon="mdiTimerOutline" size="small" variant="tonal">
        {{ t('ingredients.brew.time', { time: formatDuration(brewSeconds) }) }}
      </v-chip>
      <span v-if="brewTempC == null && brewSeconds == null" class="text-body-2 text-medium-emphasis">
        {{ t('ingredients.brew.none') }}
      </span>
    </template>
  </div>
</template>
