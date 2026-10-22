<script setup lang="ts">
definePageMeta({
  middleware: ['admin', () => navigateTo(useLocalePath()('/admin/users'), { replace: true })],
})
</script>

<template>
  <div />
</template>
