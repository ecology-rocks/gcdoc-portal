<script setup>
import { computed } from 'vue'
import Accordion from '../Accordion.vue'
import VolunteerAvailabilityForm from '../events/VolunteerAvailabilityForm.vue'
import EventManager from '../events/EventManager.vue'
import EventRoster from '../events/EventRoster.vue'

const props = defineProps({
  user: { type: Object, required: true }, // The user we are viewing (usually self)
  currentUserRole: { type: String, default: 'member' }
})

const isManagerOrAdmin = computed(() => ['manager', 'admin'].includes(props.currentUserRole))
</script>

<template>
  <div class="animate-fade-in">
    <div class="mb-6">
      <h2 class="text-xl font-bold text-gray-700">📅 Events & Volunteering</h2>
      <p class="text-sm text-gray-500">View upcoming events and manage your volunteer schedule.</p>
    </div>

    <div class="grid gap-6">
      <VolunteerAvailabilityForm :user="user" />

      <div v-if="isManagerOrAdmin" class="border-t pt-6 mt-2">
        <h3 class="text-lg font-bold text-gray-800 mb-4 bg-gray-100 p-2 rounded">
           🔒 Manager Event Controls
        </h3>
        
        <div class="grid gap-6">
          <EventRoster /> 
          
          <div class="border-t my-2"></div>
          
          <Accordion title="⚙️ Manage Event Definitions" color="gray" :defaultOpen="false">
             <EventManager />
          </Accordion>
        </div>
      </div>
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