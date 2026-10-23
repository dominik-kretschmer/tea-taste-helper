<script setup lang="ts">
// Hinweis nach der Weiterleitung von einem zusammengeführten Eintrag (05 AK-4.2)
const props = defineProps<{ entityType: CatalogTypeValue }>()

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const source = computed(() => {
  const value = route.query.mergedFrom
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null
})
</script>

<template>
  <v-alert v-if="source" type="info" variant="tonal" density="compact" class="mb-4">
    {{ t('moderation.merge.mergedFrom') }}
    <NuxtLink :to="localePath({ name: entityRouteName(props.entityType, 'history'), params: { id: source } })" class="d-block">
      {{ t('moderation.merge.mergedFromHistory') }}
    </NuxtLink>
  </v-alert>
</template>
