<script setup lang="ts">
import { mdiCallMerge, mdiEyeOffOutline, mdiShieldAccountOutline } from '@mdi/js'

// Moderationsaktionen auf Detailseiten (05 AK-4.1, AK-5.1); nur für Moderatoren eingebunden
defineProps<{ entityType: CatalogTypeValue, entityId: string }>()
const emit = defineEmits<{ hidden: [] }>()

const { t } = useI18n()
const dialog = ref<'merge' | 'hide' | null>(null)
const mergeOpen = computed({ get: () => dialog.value === 'merge', set: (value) => { dialog.value = value ? 'merge' : null } })
const hideOpen = computed({ get: () => dialog.value === 'hide', set: (value) => { dialog.value = value ? 'hide' : null } })
</script>

<template>
  <v-menu location="bottom end">
    <template #activator="{ props }">
      <v-btn v-bind="props" variant="outlined" :prepend-icon="mdiShieldAccountOutline">
        {{ t('moderation.menu') }}
      </v-btn>
    </template>
    <v-list density="compact">
      <v-list-item :prepend-icon="mdiCallMerge" :title="t('moderation.merge.menu')" @click="dialog = 'merge'" />
      <v-list-item :prepend-icon="mdiEyeOffOutline" :title="t('moderation.hide.menu')" base-color="error" @click="dialog = 'hide'" />
    </v-list>
  </v-menu>
  <ModerationMergeDialog v-model="mergeOpen" :entity-type="entityType" :source-id="entityId" />
  <ModerationHideDialog v-model="hideOpen" :entity-type="entityType" :entity-id="entityId" @done="emit('hidden')" @merge="dialog = 'merge'" />
</template>
