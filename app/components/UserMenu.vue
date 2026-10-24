<script setup lang="ts">
import { mdiAccountCircle, mdiAccountCircleOutline, mdiCogOutline, mdiPackageVariantClosed, mdiKeyOutline, mdiLogin, mdiLogout, mdiShieldAccountOutline } from '@mdi/js'

const { user, isAdmin, isModerator, logout } = useAuth()
const { count: openReports, refresh: refreshOpenReports } = useOpenReports()
const { t } = useI18n()
const localePath = useLocalePath()

async function onLogout() {
  await logout()
  await navigateTo(localePath('/'))
}

function onMenu(open: boolean) {
  if (open) refreshOpenReports()
}
</script>

<template>
  <template v-if="user">
    <v-menu location="bottom end" @update:model-value="onMenu">
      <template #activator="{ props }">
        <v-btn v-bind="props" :icon="mdiAccountCircle" :aria-label="t('nav.account', { name: user.displayName })" />
      </template>

      <v-list density="compact" min-width="220">
        <v-list-item :title="user.displayName" :subtitle="user.email" />
        <v-divider />
        <v-list-item :prepend-icon="mdiPackageVariantClosed" :title="t('nav.pantry')" :to="localePath({ name: 'pantry' })" />
        <v-list-item :prepend-icon="mdiKeyOutline" :title="t('nav.changePassword')" :to="localePath('/account/password')" />
        <v-list-item v-if="isModerator" :prepend-icon="mdiShieldAccountOutline" :title="t('nav.moderation')" :to="localePath('/admin/reports')">
          <template v-if="openReports" #append>
            <v-badge :content="openReports" color="error" inline :aria-label="t('nav.openReports', { count: openReports })" />
          </template>
        </v-list-item>
        <v-list-item v-if="isAdmin" :prepend-icon="mdiCogOutline" :title="t('nav.admin')" :to="localePath('/admin/users')" />
        <v-list-item :prepend-icon="mdiLogout" :title="t('nav.logout')" @click="onLogout" />
      </v-list>
    </v-menu>
  </template>

  <template v-else>
    <!-- Breite Bildschirme: zwei Buttons; schmale: ein Menü (per CSS, damit SSR und Browser gleich rendern) -->
    <div class="d-none d-sm-flex ga-2 mr-2">
      <v-btn variant="text" :to="localePath('/login')">
        {{ t('nav.login') }}
      </v-btn>
      <v-btn variant="outlined" :to="localePath('/register')">
        {{ t('nav.register') }}
      </v-btn>
    </div>
    <v-menu location="bottom end">
      <template #activator="{ props }">
        <v-btn v-bind="props" class="d-sm-none" :icon="mdiAccountCircleOutline" :aria-label="t('nav.login')" />
      </template>
      <v-list density="compact">
        <v-list-item :prepend-icon="mdiLogin" :title="t('nav.login')" :to="localePath('/login')" />
        <v-list-item :title="t('nav.register')" :to="localePath('/register')" />
      </v-list>
    </v-menu>
  </template>
</template>
