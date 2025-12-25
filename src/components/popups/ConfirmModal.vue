<script setup>
defineProps({
  title: String,
  message: String,
  isOpen: Boolean
})

const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 animate-scale-in">
      <h3 class="text-lg font-bold text-gray-900 mb-2">{{ title }}</h3>
      <p class="text-gray-600 mb-6 text-sm">{{ message }}</p>
      
      <div class="flex justify-end gap-3">
        <button 
          @click="$emit('cancel')"
          class="px-4 py-2 text-gray-600 font-bold text-sm hover:bg-gray-100 rounded"
        >
          Cancel
        </button>
        <button 
          @click="$emit('confirm')"
          class="px-4 py-2 bg-indigo-600 text-white font-bold text-sm rounded shadow hover:bg-indigo-700"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-scale-in {
  animation: scaleIn 0.2s ease-out;
}
@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>