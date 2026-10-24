<script setup lang="ts">
import { mdiPackageVariantClosed, mdiPackageVariantClosedPlus } from '@mdi/js'

// „In den Vorrat“ bzw. „Im Vorrat: …“ auf den Detailseiten (06 AK-2.2)
const props = defineProps<{ entityType: CatalogTypeValue, entityId: string, name: string }>()

const { t } = useI18n()
const localePath = useLocalePath()
const { loggedIn } = useAuth()
const amount = usePantryAmount()

// server: false – die Detailseite wartet nicht auf das Lookup
const { data } = useFetch<{ entry: PantryRef | null }>('/api/pantry/lookup', {
  query: computed(() => ({ type: props.entityType, entityId: props.entityId })),
  server: false,
  immediate: loggedIn.value,
})
const entry = computed(() => data.value?.entry ?? null)
const dialog = ref(false)

function onSaved(saved: PantryRef) {
  data.value = { entry: saved }
}
</script>

<template>
  <v-btn
    v-if="loggedIn && entry"
    variant="tonal"
    color="primary"
    :prepend-icon="mdiPackageVariantClosed"
    :to="localePath({ name: 'pantry', query: entityType === 'tea' ? { type: 'tea' } : {} })"
  >
    {{ t('pantry.button.inPantry', { amount: amount(entry.grams) }) }}
  </v-btn>
  <v-btn v-else-if="loggedIn" variant="outlined" color="primary" :prepend-icon="mdiPackageVariantClosedPlus" @click="dialog = true">
    {{ t('pantry.button.add') }}
  </v-btn>
  <PantryEntryDialog
    v-if="dialog"
    v-model="dialog"
    :preset="{ entityType, entityId, name }"
    @saved="onSaved"
  />
</template>
