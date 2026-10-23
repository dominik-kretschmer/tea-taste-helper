<script setup lang="ts">
import { mdiMenu } from '@mdi/js'

const { t } = useI18n()
const localeHead = useLocaleHead()
const localePath = useLocalePath()
const drawer = ref(false)

useHead(() => ({
  htmlAttrs: { lang: localeHead.value.htmlAttrs.lang },
  title: t('app.name'),
}))
</script>

<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable">
      <template #prepend>
        <!-- Schmale Bildschirme: Menü-Icon öffnet den Drawer (per CSS, damit SSR und Browser gleich rendern) -->
        <v-app-bar-nav-icon class="d-sm-none" :icon="mdiMenu" :aria-label="t('nav.menu')" @click="drawer = !drawer" />
      </template>
      <v-app-bar-title>
        <NuxtLink :to="localePath({ name: 'index' })" class="app-title">
          {{ t('app.name') }}
        </NuxtLink>
      </v-app-bar-title>
      <template #append>
        <AppNav class="d-none d-sm-flex mr-2" />
        <ThemeSwitcher />
        <LanguageSwitcher />
        <UserMenu />
      </template>
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" temporary>
      <AppNav list @click="drawer = false" />
    </v-navigation-drawer>

    <v-main>
      <v-container class="py-6">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.app-title {
  color: inherit;
  text-decoration: none;
}
</style>
