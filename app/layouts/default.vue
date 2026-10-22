<script setup lang="ts">
const { t } = useI18n()
const localeHead = useLocaleHead()

useHead(() => ({
  htmlAttrs: { lang: localeHead.value.htmlAttrs.lang },
  title: t('app.name'),
}))
</script>

<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable">
      <v-app-bar-title>{{ t('app.name') }}</v-app-bar-title>
      <template #append>
        <LanguageSwitcher />
        <UserMenu />
      </template>
    </v-app-bar>

    <v-main>
      <v-container class="py-6">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>
