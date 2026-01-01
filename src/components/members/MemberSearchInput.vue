<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  members: Array,
  modelValue: String, // v-model matches this
  disabled: Boolean
})

const emit = defineEmits(['update:modelValue'])

const query = ref("")
const isOpen = ref(false)

// Sync external value changes (e.g. from existing data) to the text box
watch(() => props.modelValue, (val) => {
  const selected = props.members.find(m => m.id === val)
  if (selected) {
    query.value = selected.name
  } else if (!val) {
    query.value = ""
  }
}, { immediate: true })

const filteredMembers = computed(() => {
  return props.members.filter(m => 
    m.name.toLowerCase().includes(query.value.toLowerCase())
  )
})

const handleInput = (e) => {
  query.value = e.target.value
  isOpen.value = true
  if (e.target.value === "") {
    emit('update:modelValue', "")
  }
}

const selectMember = (m) => {
  query.value = m.name
  emit('update:modelValue', m.id)
  isOpen.value = false
}

const handleBlur = () => {
  setTimeout(() => isOpen.value = false, 200)
}
</script>

<template>
  <div class="relative">
    <input
      type="text"
      class="w-full p-2 border rounded"
      :class="disabled ? 'bg-gray-100 text-gray-500' : 'bg-white'"
      :placeholder="disabled ? '' : 'Type to search...'"
      :value="query"
      :disabled="disabled"
      @input="handleInput"
      @focus="isOpen = true"
      @blur="handleBlur"
    />

    <ul v-if="isOpen && !disabled && filteredMembers.length > 0" class="absolute z-50 w-full bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto mt-1">
      <li
        v-for="m in filteredMembers"
        :key="m.id"
        class="p-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 last:border-0"
        @click="selectMember(m)"
      >
        {{ m.name }}
      </li>
    </ul>

    <div v-if="isOpen && !disabled && query && filteredMembers.length === 0" class="absolute z-50 w-full bg-white border border-gray-300 rounded shadow p-2 text-xs text-gray-500 mt-1">
      No matches found
    </div>
  </div>
</template>