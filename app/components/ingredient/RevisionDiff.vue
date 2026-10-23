<script setup lang="ts">
// Vergleichstabelle Feld | Sprache | vorher | nachher; auf schmalen Bildschirmen gestapelt (AK-5.2).
defineProps<{ changes: SnapshotChange[] }>()

const { t } = useI18n()

function format(change: SnapshotChange, value: unknown): string {
  if (value === null || value === undefined || value === '') return '–'
  switch (change.field) {
    case 'caffeine':
      return t(`catalog.caffeineOptions.${value}`)
    case 'brewTempC':
      return t('ingredients.brew.temp', { temp: value as number })
    case 'brewSeconds':
      return t('ingredients.brew.time', { time: formatDuration(value as number) })
    default:
      return String(value)
  }
}
</script>

<template>
  <div class="diff" role="table" :aria-label="t('ingredients.diff.field')">
    <div class="diff-row diff-head" role="row">
      <span role="columnheader">{{ t('ingredients.diff.field') }}</span>
      <span role="columnheader">{{ t('ingredients.diff.locale') }}</span>
      <span role="columnheader">{{ t('ingredients.diff.before') }}</span>
      <span role="columnheader">{{ t('ingredients.diff.after') }}</span>
    </div>
    <div v-for="(change, index) in changes" :key="index" class="diff-row" role="row">
      <span role="cell" class="font-weight-medium">{{ t(`ingredients.diffFields.${change.field}`) }}</span>
      <span role="cell" :data-label="t('ingredients.diff.locale')">{{ change.locale ? t(`language.${change.locale}`) : '–' }}</span>
      <!-- Nur Text-Interpolation (AK-7.2) -->
      <span role="cell" class="value before" :data-label="t('ingredients.diff.before')">{{ format(change, change.from) }}</span>
      <span role="cell" class="value after" :data-label="t('ingredients.diff.after')">{{ format(change, change.to) }}</span>
    </div>
  </div>
</template>

<style scoped>
.diff-row {
  display: grid;
  grid-template-columns: 9rem 7rem 1fr 1fr;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.diff-head {
  font-weight: 600;
}
.value {
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.before {
  color: rgb(var(--v-theme-error));
}
.after {
  color: rgb(var(--v-theme-success));
}
/* Schmale Bildschirme: jede Änderung als Block, Spaltennamen als Beschriftung */
@media (max-width: 599.98px) {
  .diff-head {
    display: none;
  }
  .diff-row {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
  [data-label]::before {
    content: attr(data-label) ': ';
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }
}
</style>
