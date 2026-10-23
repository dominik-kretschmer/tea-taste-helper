<script setup lang="ts">
import { mdiEyeOffOutline } from '@mdi/js'

// Hinweis für Moderatoren auf ausgeblendeten Einträgen, mit „Wiederherstellen“ (05 AK-5.4, AK-5.5)
const props = defineProps<{ entityType: CatalogTypeValue, entityId: string, state: ModerationState }>()
const emit = defineEmits<{ restored: [] }>()

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { $api } = useNuxtApp()
const { formError, handleError } = useFormErrors()
const busy = ref(false)
const duplicateId = ref<string | null>(null)

const reasonText = computed(() => props.state.hiddenReason === BULK_REVERT_REASON ? t('moderation.hidden.bulkReason') : props.state.hiddenReason)

async function restore() {
  busy.value = true
  duplicateId.value = null
  try {
    await $api(`/api/admin/${entityApiSegment(props.entityType)}/${props.entityId}/restore`, { method: 'POST' })
    emit('restored')
  }
  catch (err) {
    const { code, details } = handleError(err)
    if (code === 'DUPLICATE_NAME') {
      const info = details as { ingredientId?: string, teaId?: string }
      duplicateId.value = info.ingredientId ?? info.teaId ?? null
    }
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <v-alert type="warning" variant="tonal" :icon="mdiEyeOffOutline" class="mb-4">
    <div class="font-weight-medium">
      {{ t('moderation.hidden.banner', { date: formatDateTime(state.hiddenAt, locale), name: state.hiddenBy?.displayName ?? t('catalog.deletedAccount') }) }}
    </div>
    <div class="text-break">
      {{ t('moderation.hidden.reason', { reason: reasonText }) }}
    </div>
    <div v-if="formError" class="text-error mt-2">
      {{ formError }}
      <NuxtLink v-if="duplicateId" :to="localePath({ name: entityRouteName(entityType), params: { id: duplicateId } })" class="d-block">
        {{ t('moderation.revert.duplicateLink') }}
      </NuxtLink>
    </div>
    <template #append>
      <v-btn variant="outlined" size="small" :loading="busy" @click="restore">
        {{ t('moderation.hidden.restore') }}
      </v-btn>
    </template>
  </v-alert>
</template>
