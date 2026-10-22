<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <v-row justify="center">
    <v-col cols="12" md="8" lg="6">
      <h1 class="text-h4 mb-4">
        {{ t('home.title') }}
      </h1>
      <p class="text-body-1">
        {{ t('home.intro') }}
      </p>
    </v-col>
  </v-row>
</template>
