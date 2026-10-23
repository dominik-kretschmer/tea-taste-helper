<script setup lang="ts">
// Tabs des Verwaltungsbereichs je nach Rolle: Moderation für Moderatoren und Admins, Nutzer und Audit nur für Admins (05 AK-0.1)
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { isAdmin } = useAuth()
const { count: openReports, refresh } = useOpenReports()

// Seitenwechsel im Bereich aktualisiert das Badge (AK-3.5)
watch(() => route.path, () => refresh(), { immediate: true })
</script>

<template>
  <div class="mb-6">
    <h1 class="text-h4 mb-2">
      {{ isAdmin ? t('admin.title') : t('moderation.title') }}
    </h1>
    <v-tabs color="primary" density="comfortable" show-arrows>
      <v-tab :to="localePath('/admin/reports')">
        {{ t('admin.tabs.reports') }}
        <v-badge v-if="openReports" :content="openReports" color="error" inline class="ml-1" />
      </v-tab>
      <v-tab :to="localePath('/admin/hidden')">
        {{ t('admin.tabs.hidden') }}
      </v-tab>
      <v-tab :to="localePath('/admin/moderation/users')">
        {{ t('admin.tabs.moderationUsers') }}
      </v-tab>
      <template v-if="isAdmin">
        <v-tab :to="localePath('/admin/users')">
          {{ t('admin.tabs.users') }}
        </v-tab>
        <v-tab :to="localePath('/admin/audit')">
          {{ t('admin.tabs.audit') }}
        </v-tab>
      </template>
    </v-tabs>
  </div>
</template>
