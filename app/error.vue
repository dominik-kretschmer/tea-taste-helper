<script setup lang="ts">
import type { NuxtError } from '#app'

// Eigene Fehlerseite im App-Layout (00-chore/07). Zeigt nie Details vom Server (message, stack).
const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()
const localePath = useLocalePath()

const status = computed(() => props.error.statusCode ?? 500)
const kind = computed(() => (status.value === 404 ? 'notFound' : 'generic'))

useHead({ title: () => t(`errorPage.${kind.value}.title`) })

// clearError verlässt den Fehlerzustand; ein Link allein würde ihn stehen lassen
const go = (target: string) => clearError({ redirect: target })
</script>

<template>
  <NuxtLayout>
    <div class="text-center py-8">
      <h1 class="text-h4 mb-4">
        {{ t(`errorPage.${kind}.title`) }}
      </h1>
      <p class="text-body-1 mb-2">
        {{ t(`errorPage.${kind}.text`) }}
      </p>
      <p class="text-body-2 text-medium-emphasis mb-6">
        {{ t('errorPage.status', { status }) }}
      </p>
      <div class="d-flex flex-wrap justify-center ga-2">
        <v-btn color="primary" @click="go(localePath('/'))">
          {{ t('errorPage.home') }}
        </v-btn>
        <v-btn variant="outlined" @click="go(localePath({ name: 'ingredients' }))">
          {{ t('errorPage.ingredients') }}
        </v-btn>
      </div>
    </div>
  </NuxtLayout>
</template>
