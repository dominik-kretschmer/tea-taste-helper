<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => t('ingredients.title') })
</script>

<template>
  <h1 class="text-h4 mb-4">
    {{ t('ingredients.title') }}
  </h1>
</template>
