import type { ChangePasswordInput, LoginInput, RegisterInput } from '#shared/schemas/auth'

/** Angemeldeter Nutzer und Auth-Aktionen; der Zustand wird beim SSR geladen (plugins/auth.server.ts). */
export function useAuth() {
  const user = useState<PublicUser | null>('auth:user', () => null)
  const { $api } = useNuxtApp()
  const requestFetch = useRequestFetch()

  async function refresh() {
    const response = await requestFetch<{ user: PublicUser | null }>('/api/auth/me')
    user.value = response.user
  }

  async function login(input: LoginInput) {
    const response = await $api<{ user: PublicUser }>('/api/auth/login', { method: 'POST', body: input })
    user.value = response.user
  }

  async function register(input: RegisterInput) {
    const response = await $api<{ user: PublicUser }>('/api/auth/register', { method: 'POST', body: input })
    user.value = response.user
  }

  async function logout() {
    try {
      await $api('/api/auth/logout', { method: 'POST' })
    }
    finally {
      user.value = null
    }
  }

  async function changePassword(input: ChangePasswordInput) {
    await $api('/api/auth/password', { method: 'POST', body: input })
    if (user.value) user.value = { ...user.value, mustChangePassword: false }
  }

  return {
    user: readonly(user),
    loggedIn: computed(() => !!user.value),
    isAdmin: computed(() => hasRole(user.value, 'admin')),
    refresh,
    login,
    register,
    logout,
    changePassword,
  }
}
