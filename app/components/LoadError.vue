<script setup lang="ts">
// Liste konnte nicht geladen werden – erkennbar als Fehler, nicht als „leer“ (00-chore/07)
defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <v-alert type="error" variant="tonal" :text="t('common.loadError')" class="mb-4">
    <template #append>
      <v-btn variant="text" @click="$emit('retry')">
        {{ t('common.retry') }}
      </v-btn>
    </template>
  </v-alert>
</template>
