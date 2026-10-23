<script setup lang="ts">
import { mdiThemeLightDark, mdiWeatherNight, mdiWeatherSunny } from '@mdi/js'

const { t } = useI18n()
const { preference, setPreference } = useColorTheme()

const options = THEME_PREFERENCES
const icons: Record<ThemePreference, string> = { light: mdiWeatherSunny, dark: mdiWeatherNight, system: mdiThemeLightDark }
</script>

<template>
  <v-menu location="bottom end">
    <template #activator="{ props }">
      <v-btn v-bind="props" :icon="mdiThemeLightDark" :aria-label="t('theme.label')" :title="t('theme.label')" />
    </template>

    <v-list density="compact" :selected="[preference]">
      <v-list-item
        v-for="entry in options"
        :key="entry"
        :value="entry"
        :prepend-icon="icons[entry]"
        :title="t(`theme.${entry}`)"
        @click="setPreference(entry)"
      />
    </v-list>
  </v-menu>
</template>
