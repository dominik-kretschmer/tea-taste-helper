<script setup lang="ts">
import { DISPLAY_NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, registerSchema } from '#shared/schemas/auth'

definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const { register } = useAuth()
const { fieldErrors, formError, validate, handleError } = useFormErrors()

useHead({ title: () => t('register.title') })

const form = reactive({ email: '', displayName: '', password: '', remember: false })
const loading = ref(false)

async function submit() {
  const input = validate(registerSchema, form)
  if (!input) return
  loading.value = true
  try {
    await register(input)
    await navigateTo(localePath('/'))
  }
  catch (error) {
    handleError(error)
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
        {{ t('register.title') }}
      </h1>
      <v-form @submit.prevent="submit">
        <v-alert v-if="formError" type="error" variant="tonal" class="mb-4" :text="formError" />
        <v-text-field
          v-model="form.email"
          :label="t('fields.email')"
          type="email"
          autocomplete="email"
          :error-messages="fieldErrors.email"
        />
        <v-text-field
          v-model="form.displayName"
          :label="t('fields.displayName')"
          autocomplete="nickname"
          :counter="DISPLAY_NAME_MAX"
          :hint="t('register.displayNameHint')"
          persistent-hint
          :error-messages="fieldErrors.displayName"
          class="mb-2"
        />
        <PasswordField
          v-model="form.password"
          :label="t('fields.password')"
          autocomplete="new-password"
          :hint="t('register.passwordHint', { min: PASSWORD_MIN, max: PASSWORD_MAX })"
          :error-messages="fieldErrors.password"
        />
        <v-checkbox v-model="form.remember" :label="t('fields.remember')" hide-details class="mb-4" />
        <v-btn type="submit" color="primary" block size="large" :loading="loading">
          {{ t('register.submit') }}
        </v-btn>
      </v-form>
      <p class="text-body-2 mt-6">
        {{ t('register.haveAccount') }}
        <NuxtLink :to="localePath('/login')">
          {{ t('nav.login') }}
        </NuxtLink>
      </p>
    </v-col>
  </v-row>
</template>
