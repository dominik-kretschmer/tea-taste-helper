<script setup lang="ts">
import { mdiAccountCancelOutline, mdiAccountCheckOutline, mdiBackupRestore, mdiMagnify } from '@mdi/js'

// Nutzer sperren, entsperren und ihre Änderungen zurücksetzen (05 AK-6.1, AK-6.4, AK-6.6, AK-7.1)
definePageMeta({ middleware: 'moderator' })

const { t, locale } = useI18n()
const { $api } = useNuxtApp()
const { user: me, isAdmin } = useAuth()
const { formError, handleError } = useFormErrors()

useHead({ title: () => `${t('admin.tabs.moderationUsers')} – ${t('moderation.title')}` })

const search = ref('')
const query = reactive({ q: '', blocked: false, page: 1 })
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    query.q = value.trim()
    query.page = 1
  }, 300)
})
watch(() => query.blocked, () => {
  query.page = 1
})
const { data, pending, error, refresh } = await useFetch<Page<ModerationUser>>('/api/admin/moderation/users', {
  query: computed(() => ({ q: query.q || undefined, blocked: query.blocked ? '1' : undefined, page: query.page })),
})

/** Wie der Server (assertCanBlock): Admins nie, Moderatoren nur durch Admins, nie sich selbst (AK-6.5) */
const canModerate = (user: ModerationUser) =>
  user.id !== me.value?.id && user.role !== 'admin' && (user.role === 'user' || isAdmin.value)

function status(user: ModerationUser): { text: string, color?: string } {
  if (user.blocked) {
    return user.blockedUntil
      ? { text: t('moderation.users.status.until', { date: formatDateTime(user.blockedUntil, locale.value) }), color: 'error' }
      : { text: t('moderation.users.status.permanent'), color: 'error' }
  }
  return user.blockedAt ? { text: t('moderation.users.status.expired'), color: 'warning' } : { text: t('moderation.users.status.active') }
}

const selected = ref<ModerationUser | null>(null)
const dialog = ref<'block' | 'bulk' | null>(null)
const blockOpen = computed({ get: () => dialog.value === 'block', set: (value) => { if (!value) dialog.value = null } })
const bulkOpen = computed({ get: () => dialog.value === 'bulk', set: (value) => { if (!value) dialog.value = null } })
function open(user: ModerationUser, name: 'block' | 'bulk') {
  selected.value = user
  dialog.value = name
}

const snackbar = ref<string | null>(null)
async function unblock(user: ModerationUser) {
  formError.value = null
  try {
    await $api(`/api/admin/users/${user.id}/block`, { method: 'DELETE' })
    snackbar.value = t('moderation.users.unblocked', { name: user.displayName })
    await refresh()
  }
  catch (err) {
    handleError(err)
  }
}
async function onBlocked(user: ModerationUser) {
  snackbar.value = t('moderation.block.done', { name: user.displayName })
  await refresh()
}
</script>

<template>
  <div>
    <AdminNav />

    <div class="d-flex flex-wrap ga-4 align-center mb-2">
      <v-text-field
        v-model="search"
        :label="t('moderation.users.search')"
        :prepend-inner-icon="mdiMagnify"
        clearable
        hide-details
        class="flex-grow-1"
        style="min-width: 220px"
      />
      <v-switch v-model="query.blocked" :label="t('moderation.users.onlyBlocked')" color="primary" hide-details inset />
    </div>
    <v-alert v-if="formError" type="error" variant="tonal" density="compact" class="mb-4" :text="formError" />

    <LoadError v-if="error" @retry="refresh()" />
    <template v-else>
      <v-progress-linear v-if="pending" indeterminate class="mb-2" />
      <p v-if="data && !data.items.length" class="text-medium-emphasis">
        {{ t('moderation.users.empty') }}
      </p>

      <v-card v-for="user in data?.items ?? []" :key="user.id" variant="outlined" class="mb-3">
        <v-card-item>
          <v-card-title class="text-wrap text-break">
            {{ user.displayName }}
          </v-card-title>
          <v-card-subtitle class="d-flex flex-wrap ga-1 align-center">
            <v-chip size="x-small" variant="tonal">
              {{ t(`roles.${user.role}`) }}
            </v-chip>
            <v-chip size="x-small" :color="status(user).color" variant="tonal">
              {{ status(user).text }}
            </v-chip>
            <span v-if="user.email" class="text-break">{{ user.email }}</span>
          </v-card-subtitle>
        </v-card-item>
        <v-card-text class="pt-0">
          <div class="text-body-2">
            {{ t('moderation.users.changes', { count: user.changes30d }) }}
          </div>
          <div v-if="user.blockReason" class="text-body-2 text-break">
            {{ t('moderation.hidden.reason', { reason: user.blockReason }) }}
          </div>
        </v-card-text>
        <v-card-actions v-if="canModerate(user)" class="flex-wrap ga-1">
          <v-btn size="small" color="error" :prepend-icon="mdiAccountCancelOutline" @click="open(user, 'block')">
            {{ user.blocked ? t('moderation.users.actions.changeBlock') : t('moderation.users.actions.block') }}
          </v-btn>
          <v-btn v-if="user.blockedAt" size="small" :prepend-icon="mdiAccountCheckOutline" @click="unblock(user)">
            {{ t('moderation.users.actions.unblock') }}
          </v-btn>
          <v-btn size="small" :prepend-icon="mdiBackupRestore" @click="open(user, 'bulk')">
            {{ t('moderation.users.actions.bulkRevert') }}
          </v-btn>
        </v-card-actions>
      </v-card>

      <v-pagination
        v-if="data && data.total > data.pageSize"
        v-model="query.page"
        :length="Math.ceil(data.total / data.pageSize)"
        density="comfortable"
      />
    </template>

    <template v-if="selected">
      <ModerationBlockDialog v-model="blockOpen" :user="selected" @done="onBlocked" />
      <ModerationBulkRevertDialog v-model="bulkOpen" :user="selected" @done="refresh()" />
    </template>

    <v-snackbar :model-value="!!snackbar" color="success" :text="snackbar ?? ''" @update:model-value="snackbar = null" />
  </div>
</template>
