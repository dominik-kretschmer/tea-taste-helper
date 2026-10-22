<script setup lang="ts">
import { mdiTranslate } from '@mdi/js'

const { locale, locales, setLocale, t } = useI18n()
</script>

<template>
  <v-menu location="bottom end">
    <template #activator="{ props }">
      <v-btn v-bind="props" :icon="mdiTranslate" :aria-label="t('nav.language')" :title="t('nav.language')" />
    </template>

    <v-list density="compact" :selected="[locale]">
      <v-list-item
        v-for="entry in locales"
        :key="entry.code"
        :value="entry.code"
        :title="t(`language.${entry.code}`)"
        :lang="entry.code"
        @click="setLocale(entry.code)"
      />
    </v-list>
  </v-menu>
</template>
