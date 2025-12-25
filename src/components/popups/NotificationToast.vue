<script setup>
import { onMounted } from 'vue'

const props = defineProps({
  message: String,
  type: {
    type: String,
    default: 'success' // 'success' | 'error' | 'info'
  },
  duration: {
    type: Number,
    default: 3000
  }
})

const emit = defineEmits(['close'])

onMounted(() => {
  if (props.duration > 0) {
    setTimeout(() => {
      emit('close')
    }, props.duration)
  }
})
</script>

<template>
  <div 
    class="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-6 py-4 rounded shadow-lg animate-slide-up border-l-8"
    :class="{
      'bg-white border-green-500 text-gray-800': type === 'success',
      'bg-red-50 border-red-500 text-red-900': type === 'error',
      'bg-blue-50 border-blue-500 text-blue-900': type === 'info'
    }"
  >
    <span class="text-2xl">
      {{ type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️' }}
    </span>
    <div>
      <h4 class="font-bold text-sm uppercase opacity-75">{{ type }}</h4>
      <p class="font-bold">{{ message }}</p>
    </div>
    <button @click="$emit('close')" class="ml-4 text-gray-400 hover:text-gray-600 font-bold">✕</button>
  </div>
</template>

<style scoped>
.animate-slide-up {
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>