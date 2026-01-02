<script setup>
import { ref, computed } from 'vue'
import Accordion from '@/components/common/Accordion.vue'

// Admin Tools
import CourseCatalog from './CourseCatalog.vue' // <--- NEW IMPORT
import WeeklySchedule from '@/components/common/WeeklySchedule.vue'

const props = defineProps({
  currentUser: { type: Object, required: true }, 
  refreshKey: { type: Number, default: 0 } 
})

const emit = defineEmits(['select-user', 'add-member'])

const resumeSheet = ref(null)

const isAdmin = computed(() => props.currentUser.role === 'admin')
const isRegistrar = computed(() => isAdmin.value || props.currentUser.role === 'registrar') // <--- UPDATE LOGIC

const clearResume = () => { resumeSheet.value = null }
</script>

<template>
  <div class="animate-fade-in">
    
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-gray-700">
        Registrar Tools
      </h2>
      <button 
        v-if="isAdmin"
        @click="$emit('add-member')"
        class="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 font-bold flex items-center gap-2 text-sm"
      >
        <span>+</span> Add New Member
      </button>
    </div>

    <div class="grid gap-6">
      
      <Accordion title="🎓 Course Catalog & Classes" color="blue" :defaultOpen="true">
        <CourseCatalog :currentUser="currentUser" />
      </Accordion>

      <Accordion title="🎓 Weekly Schedule" color="blue" :defaultOpen="true">
        <WeeklySchedule />
      </Accordion>
    </div>
  </div>
</template>