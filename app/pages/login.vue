<script setup lang="ts">
import { loginSchema } from '#shared/schemas/auth'

definePageMeta({ middleware: 'guest' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { login } = useAuth()
const { fieldErrors, formError, validate, handleError } = useFormErrors()

useHead({ title: () => t('login.title') })

const form = reactive({ email: '', password: '', remember: false })
const loading = ref(false)

async function submit() {
  const input = validate(loginSchema, form)
  if (!input) return
  loading.value = true
  try {
    await login(input)
    await navigateTo(safeRedirect(route.query.redirect, localePath('/')))
  }
  catch (error) {
    const { code, details } = handleError(error)
    // Gesperrt: Frist nennen, nie den Grund (05 AK-6.2)
    if (code === 'ACCOUNT_BLOCKED') {
      const until = (details as { until?: string | null } | undefined)?.until
      formError.value = until ? t('login.blockedUntil', { date: formatDateTime(until, locale.value) }) : t('login.blockedPermanent')
    }
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <v-row justify="center">
    <v-col cols="12" sm="8" md="6" lg="4">
      <h1 class="text-h4 mb-6">
        {{ t('login.title') }}
      </h1>
      <v-form @submit.prevent="submit">
        <v-alert v-if="formError" type="error" variant="tonal" class="mb-4" :text="formError" />
        <v-text-field
          v-model="form.email"
          :label="t('fields.email')"
          type="email"
          autocomplete="username"
          :error-messages="fieldErrors.email"
        />
        <PasswordField
          v-model="form.password"
          :label="t('fields.password')"
          autocomplete="current-password"
          :error-messages="fieldErrors.password"
        />
        <v-checkbox v-model="form.remember" :label="t('fields.remember')" hide-details class="mb-4" />
        <v-btn type="submit" color="primary" block size="large" :loading="loading">
          {{ t('login.submit') }}
        </v-btn>
      </v-form>
      <p class="text-body-2 mt-6">
        {{ t('login.noAccount') }}
        <NuxtLink :to="localePath({ path: '/register', query: redirectQuery(route.query.redirect) })">
          {{ t('nav.register') }}
        </NuxtLink>
      </p>
    </v-col>
  </v-row>
</template>
