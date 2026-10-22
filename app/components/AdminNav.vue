<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <div class="mb-6">
    <h1 class="text-h4 mb-2">
      {{ t('admin.title') }}
    </h1>
    <v-tabs color="primary" density="comfortable">
      <v-tab :to="localePath('/admin/users')">
        {{ t('admin.tabs.users') }}
      </v-tab>
      <v-tab :to="localePath('/admin/audit')">
        {{ t('admin.tabs.audit') }}
      </v-tab>
    </v-tabs>
  </div>
</template>
