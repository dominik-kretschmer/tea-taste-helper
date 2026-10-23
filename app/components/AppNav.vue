<script setup lang="ts">
import { mdiHomeOutline, mdiLeaf } from '@mdi/js'

// Hauptnavigation; `list` für den Drawer auf schmalen Bildschirmen, sonst Text-Links in der App-Bar.
defineProps<{ list?: boolean }>()

const { t } = useI18n()
const localePath = useLocalePath()

const entries = computed(() => [
  { title: t('nav.home'), icon: mdiHomeOutline, to: localePath({ name: 'index' }), exact: true },
  { title: t('nav.ingredients'), icon: mdiLeaf, to: localePath({ name: 'ingredients' }), exact: false },
])
</script>

<template>
  <v-list v-if="list" nav density="comfortable">
    <v-list-item v-for="entry in entries" :key="entry.title" :prepend-icon="entry.icon" :title="entry.title" :to="entry.to" :exact="entry.exact" />
  </v-list>
  <nav v-else class="ga-1" :aria-label="t('nav.main')">
    <v-btn v-for="entry in entries.slice(1)" :key="entry.title" variant="text" :to="entry.to">
      {{ entry.title }}
    </v-btn>
  </nav>
</template>
