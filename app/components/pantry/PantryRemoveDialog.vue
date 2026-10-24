<script setup lang="ts">
// Rückfrage vor dem Entfernen (06 AK-4.1)
defineProps<{ name: string, grams: number | null, busy?: boolean }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ confirm: [] }>()

const { t } = useI18n()
const amount = usePantryAmount()
</script>

<template>
  <v-dialog v-model="open" max-width="420">
    <v-card :title="t('pantry.remove.title')">
      <v-card-text>
        {{ t('pantry.remove.text', { name, amount: amount(grams) }) }}
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn color="error" variant="flat" :loading="busy" @click="emit('confirm')">
          {{ t('pantry.actions.remove') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
