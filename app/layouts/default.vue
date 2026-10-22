<script setup lang="ts">
const { t } = useI18n()
// Nur für das lang-Attribut; SEO-Links (hreflang) bräuchten eine feste baseUrl
const localeHead = useLocaleHead({ seo: false })

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
      </template>
    </v-app-bar>

    <v-main>
      <v-container class="py-6">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>
