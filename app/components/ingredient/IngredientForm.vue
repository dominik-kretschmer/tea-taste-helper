<script setup lang="ts">
import { mdiCoffeeOffOutline, mdiCoffeeOutline, mdiHelpCircleOutline, mdiPlus } from '@mdi/js'
import { BREW_SECONDS_MAX, BREW_SECONDS_MIN, INGREDIENT_DESCRIPTION_MAX, INGREDIENT_NAME_MAX, INGREDIENT_NOTE_MAX } from '#shared/utils/ingredient'

// Felder für Anlegen und Bearbeiten. Beim Anlegen wird eine Sprache gewählt; beim Bearbeiten gibt es
// einen Tab pro Sprache (Originalsprache markiert, fehlende Übersetzungen mit „+“).
const props = defineProps<{
  mode: 'create' | 'edit'
  /** nur beim Bearbeiten */
  sourceLocale?: ContentLocale
  /** Sprachen, die schon eine Übersetzung haben (Bearbeiten) */
  existingLocales?: ContentLocale[]
  fieldErrors: Record<string, string>
}>()

const state = defineModel<IngredientFormState>({ required: true })

const { t } = useI18n()

/**
 * Fehler zu einem Textfeld: beim Anlegen flach (`name`) und nur für die gewählte Sprache,
 * beim Bearbeiten mit Pfad (`translations.de.name`).
 */
function textError(locale: ContentLocale, field: 'name' | 'description') {
  if (props.mode === 'edit') return props.fieldErrors[`translations.${locale}.${field}`]
  return locale === state.value.locale ? props.fieldErrors[field] : undefined
}

const caffeineOptions = [
  { value: 'yes', icon: mdiCoffeeOutline },
  { value: 'no', icon: mdiCoffeeOffOutline },
  { value: 'unknown', icon: mdiHelpCircleOutline },
] as const

// Unlesbare Ziehzeit (NaN) meldet zod nur als „ungültig“ – hier mit Formatbeispiel
const brewTimeError = computed(() => {
  const error = props.fieldErrors.brewSeconds
  return error && Number.isNaN(parseDuration(state.value.brewTime)) ? t('validation.duration') : error
})

const brewTimeHint = `${formatDuration(BREW_SECONDS_MIN)} – ${formatDuration(BREW_SECONDS_MAX)}`
</script>

<template>
  <div>
    <v-btn-toggle
      v-if="mode === 'create'"
      v-model="state.locale"
      mandatory
      color="primary"
      variant="outlined"
      density="comfortable"
      class="mb-4"
      :aria-label="t('ingredients.fields.locale')"
    >
      <v-btn v-for="code in CONTENT_LOCALES" :key="code" :value="code">
        {{ t(`language.${code}`) }}
      </v-btn>
    </v-btn-toggle>

    <v-tabs v-else v-model="state.locale" color="primary" density="comfortable" class="mb-4">
      <v-tab v-for="code in CONTENT_LOCALES" :key="code" :value="code">
        <v-icon v-if="!existingLocales?.includes(code)" :icon="mdiPlus" size="small" start :aria-label="t('ingredients.editPage.missing')" />
        {{ t(`language.${code}`) }}
        <v-chip v-if="code === sourceLocale" size="x-small" class="ml-2">
          {{ t('ingredients.editPage.source') }}
        </v-chip>
      </v-tab>
    </v-tabs>

    <!-- Alle Sprachen bleiben im DOM, damit Eingaben beim Tab-Wechsel erhalten bleiben -->
    <div v-for="code in CONTENT_LOCALES" v-show="code === state.locale" :key="code" :lang="code">
      <v-text-field
        v-model="state.translations[code].name"
        :label="t('ingredients.fields.name')"
        :counter="INGREDIENT_NAME_MAX"
        :error-messages="textError(code, 'name')"
      />
      <slot v-if="code === state.locale" name="after-name" :locale="code" />
      <v-textarea
        v-model="state.translations[code].description"
        :label="t('ingredients.fields.description')"
        :counter="INGREDIENT_DESCRIPTION_MAX"
        :error-messages="textError(code, 'description')"
        auto-grow
        rows="3"
      />
    </div>

    <p class="text-subtitle-2 mb-2">
      {{ t('ingredients.fields.caffeine') }}
    </p>
    <v-btn-toggle
      v-model="state.caffeine"
      mandatory
      variant="outlined"
      density="comfortable"
      divided
      class="mb-6 flex-wrap h-auto"
      :aria-label="t('ingredients.fields.caffeine')"
    >
      <v-btn v-for="option in caffeineOptions" :key="option.value" :value="option.value" :prepend-icon="option.icon">
        {{ t(`ingredients.caffeineOptions.${option.value}`) }}
      </v-btn>
    </v-btn-toggle>

    <v-row dense>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="state.brewTempC"
          :label="t('ingredients.fields.brewTempC')"
          type="number"
          inputmode="numeric"
          hint="40 – 100"
          persistent-hint
          :error-messages="fieldErrors.brewTempC"
        />
      </v-col>
      <v-col cols="12" sm="6">
        <v-text-field
          v-model="state.brewTime"
          :label="t('ingredients.fields.brewTime')"
          placeholder="3:30"
          :hint="brewTimeHint"
          persistent-hint
          :error-messages="brewTimeError"
        />
      </v-col>
    </v-row>

    <v-text-field
      v-model="state.note"
      :label="t('ingredients.fields.note')"
      :hint="t('ingredients.fields.noteHint')"
      persistent-hint
      :counter="INGREDIENT_NOTE_MAX"
      :error-messages="fieldErrors.note"
      class="mt-4"
    />
  </div>
</template>
