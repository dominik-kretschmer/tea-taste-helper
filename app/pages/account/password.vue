<script setup lang="ts">
import { changePasswordSchema, PASSWORD_MAX, PASSWORD_MIN } from '#shared/schemas/auth'

definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const { user, changePassword } = useAuth()
const { fieldErrors, formError, validate, handleError } = useFormErrors()

useHead({ title: () => t('password.title') })

// Pflichtwechsel nach Admin-Reset (AK-6.2): Hinweis zeigen, danach zur Startseite
const required = computed(() => !!user.value?.mustChangePassword)
const form = reactive({ currentPassword: '', newPassword: '' })
const loading = ref(false)
const done = ref(false)

async function submit() {
  done.value = false
  const input = validate(changePasswordSchema, form)
  if (!input) return
  loading.value = true
  const wasRequired = required.value
  try {
    await changePassword(input)
    form.currentPassword = ''
    form.newPassword = ''
    if (wasRequired) await navigateTo(localePath('/'))
    else done.value = true
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
        {{ t('password.title') }}
      </h1>
      <v-alert v-if="required" type="warning" variant="tonal" class="mb-4" :text="t('password.required')" />
      <v-alert v-if="done" type="success" variant="tonal" class="mb-4" :text="t('password.done')" />
      <v-form @submit.prevent="submit">
        <v-alert v-if="formError" type="error" variant="tonal" class="mb-4" :text="formError" />
        <PasswordField
          v-model="form.currentPassword"
          :label="required ? t('password.temporary') : t('password.current')"
          autocomplete="current-password"
          :error-messages="fieldErrors.currentPassword"
        />
        <PasswordField
          v-model="form.newPassword"
          :label="t('password.new')"
          autocomplete="new-password"
          :hint="t('register.passwordHint', { min: PASSWORD_MIN, max: PASSWORD_MAX })"
          :error-messages="fieldErrors.newPassword"
        />
        <v-btn type="submit" color="primary" block size="large" class="mt-4" :loading="loading">
          {{ t('password.submit') }}
        </v-btn>
      </v-form>
    </v-col>
  </v-row>
</template>
