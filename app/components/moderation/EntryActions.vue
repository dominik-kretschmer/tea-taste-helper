<script setup lang="ts">
import { mdiFlagOutline } from '@mdi/js'

// Melden (alle Angemeldeten) und Moderationsmenü (Moderatoren) auf Detailseiten (05 AK-2.1, AK-2.3, AK-2.6)
defineProps<{
  entityType: CatalogTypeValue
  entityId: string
  /** aktiv und öffentlich – nur dann lässt sich melden und moderieren */
  reportable: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { loggedIn, isModerator } = useAuth()
const reportOpen = ref(false)
const reported = ref(false)
</script>

<template>
  <template v-if="reportable">
    <template v-if="loggedIn">
      <v-btn variant="text" :prepend-icon="mdiFlagOutline" @click="reportOpen = true">
        {{ t('moderation.report.action') }}
      </v-btn>
      <ModerationEntryModerationMenu v-if="isModerator" :entity-type="entityType" :entity-id="entityId" @hidden="emit('changed')" />
      <ModerationReportDialog v-model="reportOpen" :entity-type="entityType" :entity-id="entityId" @done="reported = true" />
    </template>
    <v-btn v-else variant="text" :prepend-icon="mdiFlagOutline" :to="localePath({ path: '/login', query: { redirect: route.fullPath } })">
      {{ t('moderation.report.loginHint') }}
    </v-btn>
  </template>
  <v-snackbar v-model="reported" color="success" :text="t('moderation.report.done')" />
</template>
