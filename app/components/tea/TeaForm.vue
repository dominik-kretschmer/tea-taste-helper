<script setup lang="ts">
import { CATALOG_NOTE_MAX } from '#shared/utils/catalog'
import { TEA_BRAND_MAX } from '#shared/utils/tea'

// Felder für Anlegen und Bearbeiten eines Tees. Die Sichtbarkeit gibt es nur beim Anlegen;
// danach wird über „Veröffentlichen“ auf der Detailseite umgeschaltet (AK-4).
defineProps<{
  mode: 'create' | 'edit'
  /** nur beim Bearbeiten */
  sourceLocale?: ContentLocale
  /** Sprachen, die schon eine Übersetzung haben (Bearbeiten) */
  existingLocales?: ContentLocale[]
  fieldErrors: Record<string, string>
}>()
const emit = defineEmits<{ missingIngredient: [] }>()

const state = defineModel<TeaFormState>({ required: true })

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

    <p class="text-subtitle-2 mb-2">
      {{ t('teas.fields.kind') }}
    </p>
    <v-btn-toggle
      v-model="state.kind"
      mandatory
      variant="outlined"
      density="comfortable"
      divided
      class="mb-4 flex-wrap h-auto"
      :aria-label="t('teas.fields.kind')"
    >
      <v-btn v-for="kind in TEA_KINDS" :key="kind" :value="kind">
        {{ t(`teas.kind.${kind}`) }}
      </v-btn>
    </v-btn-toggle>
    <v-text-field
      v-if="state.kind === 'bought'"
      v-model="state.brand"
      :label="t('teas.fields.brand')"
      :counter="TEA_BRAND_MAX"
      :error-messages="fieldErrors.brand"
    />

    <TeaIngredientsField v-model="state.ingredients" :field-errors="fieldErrors" class="mb-6" @missing="emit('missingIngredient')" />

    <CatalogBrewFields
      v-model:caffeine="state.caffeine"
      v-model:brew-temp-c="state.brewTempC"
      v-model:brew-time="state.brewTime"
      :field-errors="fieldErrors"
    />

    <v-switch
      v-if="mode === 'create'"
      v-model="state.visibility"
      true-value="public"
      false-value="private"
      color="primary"
      :label="t('teas.fields.visibility')"
      :hint="t('teas.fields.visibilityHint')"
      persistent-hint
      class="mt-4"
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
