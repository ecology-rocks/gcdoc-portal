<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  title: String,
  defaultOpen: {
    type: Boolean,
    default: false
  },
  color: {
    type: String,
    default: "gray"
  }
})

const isOpen = ref(props.defaultOpen)

// Watch for prop changes to reset state if needed, or stick to internal state
watch(() => props.defaultOpen, (newVal) => {
  isOpen.value = newVal
})

const colors = {
  gray: "bg-gray-100 text-gray-800 border-gray-300",
  blue: "bg-blue-50 text-blue-800 border-blue-200",
  red: "bg-red-50 text-red-800 border-red-200",
  orange: "bg-orange-50 text-orange-800 border-orange-200",
  indigo: "bg-indigo-50 text-indigo-800 border-indigo-200",
  green: "bg-green-50 text-green-800 border-green-200",
  purple: "bg-purple-50 text-purple-800 border-purple-200",
}

// Compute the class based on the prop
const headerClass = colors[props.color] || colors.gray
</script>

<template>
  <div class="border rounded mb-4 bg-white shadow-sm overflow-hidden">
    <button
      type="button"  
      class="w-full flex justify-between items-center p-4 font-bold text-left border-b hover:opacity-90 transition-opacity"
      :class="headerClass"
      @click="isOpen = !isOpen"
    >
      <span>{{ title }}</span>
      <span class="text-lg font-mono">{{ isOpen ? '−' : '+' }}</span>
    </button>
    
    <div v-if="isOpen" class="p-6">
      <slot></slot>
    </div>
  </div>
</template>