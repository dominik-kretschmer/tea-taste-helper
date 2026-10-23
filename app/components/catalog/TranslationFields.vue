<script setup lang="ts">
import { mdiPlus } from '@mdi/js'
import { CATALOG_DESCRIPTION_MAX, CATALOG_NAME_MAX } from '#shared/utils/catalog'

// Name und Beschreibung je Sprache. Beim Anlegen wird eine Sprache gewählt; beim Bearbeiten gibt es
// einen Tab pro Sprache (Originalsprache markiert, fehlende Übersetzungen mit „+“).
const props = defineProps<{
  mode: 'create' | 'edit'
  /** nur beim Bearbeiten */
  sourceLocale?: ContentLocale
  /** Sprachen, die schon eine Übersetzung haben (Bearbeiten) */
  existingLocales?: ContentLocale[]
  fieldErrors: Record<string, string>
}>()

const locale = defineModel<ContentLocale>('locale', { required: true })
const translations = defineModel<Record<ContentLocale, { name: string, description: string }>>('translations', { required: true })

const { t } = useI18n()

/**
 * Fehler zu einem Textfeld: beim Anlegen flach (`name`) und nur für die gewählte Sprache,
 * beim Bearbeiten mit Pfad (`translations.de.name`).
 */
function textError(code: ContentLocale, field: 'name' | 'description') {
  if (props.mode === 'edit') return props.fieldErrors[`translations.${code}.${field}`]
  return code === locale.value ? props.fieldErrors[field] : undefined
}
</script>

<template>
  <div>
    <v-btn-toggle
      v-if="mode === 'create'"
      v-model="locale"
      mandatory
      color="primary"
      variant="outlined"
      density="comfortable"
      class="mb-4"
      :aria-label="t('catalog.fields.locale')"
    >
      <v-btn v-for="code in CONTENT_LOCALES" :key="code" :value="code">
        {{ t(`language.${code}`) }}
      </v-btn>
    </v-btn-toggle>

    <v-tabs v-else v-model="locale" color="primary" density="comfortable" class="mb-4">
      <v-tab v-for="code in CONTENT_LOCALES" :key="code" :value="code">
        <v-icon v-if="!existingLocales?.includes(code)" :icon="mdiPlus" size="small" start :aria-label="t('catalog.tabs.missing')" />
        {{ t(`language.${code}`) }}
        <v-chip v-if="code === sourceLocale" size="x-small" class="ml-2">
          {{ t('catalog.tabs.source') }}
        </v-chip>
      </v-tab>
    </v-tabs>

    <!-- Alle Sprachen bleiben im DOM, damit Eingaben beim Tab-Wechsel erhalten bleiben -->
    <div v-for="code in CONTENT_LOCALES" v-show="code === locale" :key="code" :lang="code">
      <v-text-field
        v-model="translations[code].name"
        :label="t('catalog.fields.name')"
        :counter="CATALOG_NAME_MAX"
        :error-messages="textError(code, 'name')"
      />
      <slot v-if="code === locale" name="after-name" :locale="code" />
      <v-textarea
        v-model="translations[code].description"
        :label="t('catalog.fields.description')"
        :counter="CATALOG_DESCRIPTION_MAX"
        :error-messages="textError(code, 'description')"
        auto-grow
        rows="3"
      />
    </div>
  </div>
</template>
