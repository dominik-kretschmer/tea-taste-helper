<script setup lang="ts">
// Admins landen bei der Nutzerverwaltung, Moderatoren bei den Meldungen (05 AK-0.1)
definePageMeta({
  middleware: ['moderator', () => {
    const { isAdmin } = useAuth()
    return navigateTo(useLocalePath()(isAdmin.value ? '/admin/users' : '/admin/reports'), { replace: true })
  }],
})
</script>

<template>
  <div />
</template>
