<script setup lang="ts">
import { CATALOG_NOTE_MAX } from '#shared/utils/catalog'

// Felder für Anlegen und Bearbeiten einer Zutat; Texte und Brühwerte kommen aus den Katalog-Bausteinen.
defineProps<{
  mode: 'create' | 'edit'
  /** nur beim Bearbeiten */
  sourceLocale?: ContentLocale
  /** Sprachen, die schon eine Übersetzung haben (Bearbeiten) */
  existingLocales?: ContentLocale[]
  fieldErrors: Record<string, string>
}>()

const state = defineModel<IngredientFormState>({ required: true })

const { t } = useI18n()
</script>

<template>
  <div>
    <CatalogTranslationFields
      v-model:locale="state.locale"
      v-model:translations="state.translations"
      :mode="mode"
      :source-locale="sourceLocale"
      :existing-locales="existingLocales"
      :field-errors="fieldErrors"
    >
      <template #after-name="slotProps">
        <slot name="after-name" v-bind="slotProps" />
      </template>
    </CatalogTranslationFields>

    <CatalogBrewFields
      v-model:caffeine="state.caffeine"
      v-model:brew-temp-c="state.brewTempC"
      v-model:brew-time="state.brewTime"
      :field-errors="fieldErrors"
    />

    <v-text-field
      v-model="state.note"
      :label="t('catalog.fields.note')"
      :hint="t('catalog.fields.noteHint')"
      persistent-hint
      :counter="CATALOG_NOTE_MAX"
      :error-messages="fieldErrors.note"
      class="mt-4"
    />
  </div>
</template>
