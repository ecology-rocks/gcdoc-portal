<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, getDocs } from "firebase/firestore"
import { db } from '@/firebase'

const emit = defineEmits(['select'])

const searchQuery = ref('')
const members = ref([])
const loading = ref(false)
const showDropdown = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const combined = []
    
    // Fetch ALL Members (Registered + Legacy/Unregistered)
    const memSnap = await getDocs(collection(db, "members"))
    
    memSnap.forEach(doc => {
      const d = doc.data()
      // Note: We include 'Inactive' here so Admins can find old records
      combined.push({
        id: doc.id,
        uid: doc.id, // Critical for dashboard linking
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        type: 'registered', // You can keep this or simplify since everyone is registered now
        role: d.role,
        status: d.status
      })
    })

    // Sort alphabetically
    combined.sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""))
    members.value = combined
  } catch (err) {
    console.error("Error loading members for search:", err)
  }
  loading.value = false
})

const filteredResults = computed(() => {
  if (!searchQuery.value) return []
  const q = searchQuery.value.toLowerCase()
  
  return members.value.filter(m => {
    const full = `${m.firstName} ${m.lastName}`.toLowerCase()
    const email = (m.email || "").toLowerCase()
    return full.includes(q) || email.includes(q)
  })
})

const handleSelect = (member) => {
  emit('select', member)
  searchQuery.value = '' // Clear search after selection
  showDropdown.value = false
}

const handleBlur = () => {
  // Delay closing so the click can register
  setTimeout(() => {
    showDropdown.value = false
  }, 200)
}
</script>

<template>
  <div class="relative w-full max-w-md">
    <div class="relative">
      <span class="absolute left-3 top-2.5 text-gray-400">🔍</span>
      <input 
        type="text" 
        v-model="searchQuery" 
        @focus="showDropdown = true"
        @blur="handleBlur"
        placeholder="Search members..." 
        class="w-full pl-10 pr-4 py-2 border rounded shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
      />
      <div v-if="loading" class="absolute right-3 top-2.5">
        <div class="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
      </div>
    </div>

    <div 
      v-if="showDropdown && filteredResults.length > 0" 
      class="absolute z-50 mt-1 w-full bg-white rounded shadow-lg border border-gray-200 max-h-60 overflow-y-auto"
    >
      <ul class="py-1">
        <li 
          v-for="member in filteredResults" 
          :key="member.id"
          @mousedown="handleSelect(member)"
          class="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-0"
        >
          <div class="flex justify-between items-center">
            <div>
              <div class="font-bold text-gray-800 text-sm">
                {{ member.lastName }}, {{ member.firstName }}
              </div>
              <div class="text-xs text-gray-500">{{ member.email }}</div>
            </div>
            
            <div class="flex flex-col items-end gap-1">
               <span 
                v-if="member.role !== 'member'" 
                class="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded uppercase font-bold"
              >
                {{ member.role }}
              </span>
              <span 
                v-if="member.status && member.status !== 'Active'" 
                class="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase font-bold"
              >
                {{ member.status }}
              </span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div 
      v-if="showDropdown && searchQuery && filteredResults.length === 0 && !loading"
      class="absolute z-50 mt-1 w-full bg-white rounded shadow border p-3 text-sm text-gray-500 text-center"
    >
      No members found matching "{{ searchQuery }}"
    </div>
  </div>
</template>