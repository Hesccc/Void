<script setup>
import AppPage from './AppPage.vue'

const props = defineProps({
  api: { type: Object, default: () => ({}) },
  pluginId: { type: String, default: 'VoidCleaner' },
})

const emit = defineEmits(['close', 'switch'])
</script>

<template>
  <AppPage :api="props.api" :plugin-id="props.pluginId" hide-title @close="emit('close')" @switch="emit('switch')" />
</template>
