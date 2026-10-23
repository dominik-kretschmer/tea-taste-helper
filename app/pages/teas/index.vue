<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => t('teas.title') })
</script>

<template>
  <h1 class="text-h4 mb-4">
    {{ t('teas.title') }}
  </h1>
</template>
