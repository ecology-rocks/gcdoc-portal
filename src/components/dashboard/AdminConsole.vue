<script setup>
import { ref, computed } from 'vue'
import Accordion from '../Accordion.vue'

// Admin Tools
import ManagerLogView from '../ManagerLogView.vue'
import BulkEntryTool from '../BulkEntryTool.vue'
import SheetArchive from '../SheetArchive.vue'
import AdminPendingReview from '../AdminPendingReview.vue'
import AdminDataTools from '../AdminDataTools.vue'
import DeduplicateTool from '../datatools/DeduplicateTool.vue'

const props = defineProps({
  currentUser: { type: Object, required: true }, // The logged-in admin
  refreshKey: { type: Number, default: 0 } // Triggers re-fetch when new members added
})

const emit = defineEmits(['select-user', 'add-member'])

const resumeSheet = ref(null)

const isAdmin = computed(() => props.currentUser.role === 'admin')

// Actions
const clearResume = () => { resumeSheet.value = null }
</script>

<template>
  <div class="animate-fade-in">
    
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-gray-700">
        {{ isAdmin ? 'Administrative Tools' : 'Manager Tools' }}
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
      
      <Accordion title="📊 Facility & Volunteer Log Audit" color="indigo">
        <ManagerLogView :currentUserRole="currentUser.role" />
      </Accordion>

      <Accordion title="📝 Bulk Entry (Handwritten Sheets)" color="gray" :defaultOpen="!!resumeSheet">
        <BulkEntryTool
          :resumeSheet="resumeSheet"
          :currentUser="currentUser" 
          @clear-resume="clearResume"
        />
        <SheetArchive 
          :currentUser="currentUser" 
          @resume="(sheet) => resumeSheet = sheet" 
        />
      </Accordion>

      <template v-if="isAdmin">
        <Accordion title="⚠️ Pending Review / Applicants" color="orange">
          <AdminPendingReview />
        </Accordion>

        <Accordion title="💾 Import & Export Data" color="gray">
          <AdminDataTools />
        </Accordion>

        <Accordion title="🧹 Database Cleanup" color="red">
          <DeduplicateTool :user="currentUser" />
        </Accordion>
      </template>
      
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-in-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>