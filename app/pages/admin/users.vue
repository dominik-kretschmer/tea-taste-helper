<script setup lang="ts">
import { mdiContentCopy, mdiDotsVertical, mdiHistory, mdiLockReset, mdiMagnify } from '@mdi/js'

definePageMeta({ middleware: 'admin' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { user: me } = useAuth()
const { $api } = useNuxtApp()
const { handleError, formError } = useFormErrors()

useHead({ title: () => `${t('admin.tabs.users')} – ${t('admin.title')}` })

const search = ref('')
const query = reactive({ q: '', page: 1 })
let debounce: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    query.q = value.trim()
    query.page = 1
  }, 300)
})

const { data, pending, refresh } = await useFetch<Page<AdminUser>>('/api/admin/users', { query })

const headers = computed(() => [
  { title: t('fields.displayName'), key: 'displayName', sortable: false },
  { title: t('fields.email'), key: 'email', sortable: false },
  { title: t('admin.users.role'), key: 'role', sortable: false, width: 180 },
  { title: t('admin.users.createdAt'), key: 'createdAt', sortable: false },
  { title: t('admin.users.lastLoginAt'), key: 'lastLoginAt', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
])
const roleItems = computed(() => ROLES.map(role => ({ value: role, title: t(`roles.${role}`) })))

const snackbar = ref<{ text: string, color: string } | null>(null)

async function changeRole(target: AdminUser, role: Role) {
  if (role === target.role) return
  try {
    await $api(`/api/admin/users/${target.id}/role`, { method: 'PATCH', body: { role } })
    snackbar.value = { text: t('admin.users.roleChanged', { name: target.displayName, role: t(`roles.${role}`) }), color: 'success' }
  }
  catch (error) {
    handleError(error)
    snackbar.value = { text: formError.value ?? '', color: 'error' }
  }
  await refresh()
}

// Passwort-Reset: erst bestätigen, dann das Einmal-Passwort genau einmal anzeigen (AK-6.1)
const resetTarget = ref<AdminUser | null>(null)
const temporaryPassword = ref<string | null>(null)
const resetting = ref(false)
const copied = ref(false)

async function confirmReset() {
  if (!resetTarget.value) return
  resetting.value = true
  try {
    const response = await $api<{ temporaryPassword: string }>(`/api/admin/users/${resetTarget.value.id}/password-reset`, { method: 'POST' })
    temporaryPassword.value = response.temporaryPassword
  }
  catch (error) {
    handleError(error)
    snackbar.value = { text: formError.value ?? '', color: 'error' }
    resetTarget.value = null
  }
  finally {
    resetting.value = false
  }
}

async function copyPassword() {
  if (!temporaryPassword.value) return
  await navigator.clipboard.writeText(temporaryPassword.value)
  copied.value = true
}

function closeReset() {
  resetTarget.value = null
  temporaryPassword.value = null
  copied.value = false
}
</script>

<template>
  <div>
    <AdminNav />

    <v-text-field
      v-model="search"
      :label="t('admin.users.search')"
      :prepend-inner-icon="mdiMagnify"
      clearable
      hide-details
      class="mb-4"
      @click:clear="search = ''"
    />

    <v-data-table-server
      v-model:page="query.page"
      :headers="headers"
      :items="data?.items ?? []"
      :items-length="data?.total ?? 0"
      :items-per-page="25"
      :items-per-page-options="[{ value: 25, title: '25' }]"
      :loading="pending"
      mobile-breakpoint="md"
      item-value="id"
    >
      <template #[`item.role`]="{ item }">
        <v-select
          :model-value="item.role"
          :items="roleItems"
          :disabled="item.id === me?.id"
          :title="item.id === me?.id ? t('errors.SELF_ROLE_CHANGE') : undefined"
          :label="t('admin.users.role')"
          density="compact"
          variant="outlined"
          hide-details
          @update:model-value="(role: Role) => changeRole(item, role)"
        />
      </template>
      <template #[`item.createdAt`]="{ item }">
        {{ formatDateTime(item.createdAt, locale) }}
      </template>
      <template #[`item.lastLoginAt`]="{ item }">
        {{ formatDateTime(item.lastLoginAt, locale) }}
      </template>
      <template #[`item.actions`]="{ item }">
        <v-menu location="bottom end">
          <template #activator="{ props }">
            <v-btn v-bind="props" :icon="mdiDotsVertical" variant="text" size="small" :aria-label="t('admin.users.actionsFor', { name: item.displayName })" />
          </template>
          <v-list density="compact">
            <v-list-item :prepend-icon="mdiLockReset" :title="t('admin.reset.action')" @click="resetTarget = item" />
            <v-list-item :prepend-icon="mdiHistory" :title="t('admin.users.showAudit')" :to="localePath({ path: '/admin/audit', query: { userId: item.id } })" />
          </v-list>
        </v-menu>
      </template>
    </v-data-table-server>

    <v-dialog :model-value="!!resetTarget" max-width="480" persistent>
      <v-card v-if="resetTarget && !temporaryPassword" :title="t('admin.reset.confirmTitle')">
        <v-card-text>{{ t('admin.reset.confirmText', { name: resetTarget.displayName, email: resetTarget.email }) }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeReset">
            {{ t('common.cancel') }}
          </v-btn>
          <v-btn color="error" variant="flat" :loading="resetting" @click="confirmReset">
            {{ t('admin.reset.confirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
      <v-card v-else-if="resetTarget && temporaryPassword" :title="t('admin.reset.resultTitle')">
        <v-card-text>
          <p class="mb-4">
            {{ t('admin.reset.resultText', { name: resetTarget.displayName }) }}
          </p>
          <v-text-field :model-value="temporaryPassword" readonly hide-details variant="outlined" class="font-monospace">
            <template #append-inner>
              <v-btn :icon="mdiContentCopy" variant="text" size="small" :aria-label="t('admin.reset.copy')" @click="copyPassword" />
            </template>
          </v-text-field>
          <p v-if="copied" class="text-success text-body-2 mt-2">
            {{ t('admin.reset.copied') }}
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="closeReset">
            {{ t('common.close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="!!snackbar" :color="snackbar?.color" timeout="4000" @update:model-value="snackbar = null">
      {{ snackbar?.text }}
    </v-snackbar>
  </div>
</template>
