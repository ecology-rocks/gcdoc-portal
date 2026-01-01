<script setup>
import { ref, computed, onMounted } from 'vue'
import { collection, getDocs } from "firebase/firestore"
import { db } from '../firebase'

const emit = defineEmits(['select'])

const combinedMembers = ref([])
const searchTerm = ref("")
const loading = ref(true)
const showAll = ref(false)

onMounted(async () => {
  loading.value = true
  
  try {
    // 1. Fetch ALL members (Registered + Migrated Legacy)
    const membersSnap = await getDocs(collection(db, "members"))
    
    const all = membersSnap.docs.map(doc => {
      const d = doc.data()
      return {
        uid: doc.id,
        // If they were migrated, they likely have status: 'Unregistered'
        // We can treat that effectively as the old "legacy" type for display purposes
        ...d
      }
    })

    // 2. Sort Alphabetically
    all.sort((a, b) => (a.lastName || "").localeCompare(b.lastName || ""))
    
    combinedMembers.value = all
  } catch (err) {
    console.error("Error loading members:", err)
  }
  
  loading.value = false
})

const filteredMembers = computed(() => {
  return combinedMembers.value.filter(m => {
    // 1. Check Status
    // If "Show All" is unchecked, hide Inactive. 
    // (Note: You usually want to see 'Unregistered' people to add logs for them, 
    // so we typically only hide 'Inactive' explicitly).
    if (!showAll.value && m.status === 'Inactive') return false

    // 2. Check Search Term
    if (!searchTerm.value) return true
    
    const term = searchTerm.value.toLowerCase()
    const fullName = `${m.firstName} ${m.lastName}`.toLowerCase()
    const email = (m.email || "").toLowerCase()
    
    return fullName.includes(term) || email.includes(term)
  })
})

const handleSelect = (event) => {
  const uid = event.target.value
  if (!uid) {
    emit('select', null)
    return
  }
  const user = combinedMembers.value.find(m => m.uid === uid)
  emit('select', user)
}
</script>

<template>
  <div class="bg-blue-50 p-4 rounded border border-blue-100">
    <h3 class="font-bold text-blue-900 mb-2 text-sm uppercase">Select Member to Manage</h3>
    
    <div v-if="loading" class="text-xs text-gray-500 animate-pulse">
      Loading member list...
    </div>

    <div v-else class="space-y-3">
      <div class="flex gap-2">
        <input 
          type="text" 
          placeholder="Filter by name or email..." 
          class="flex-1 p-2 border rounded border-blue-300 focus:outline-none focus:border-blue-500"
          v-model="searchTerm"
        />
        
        <label class="flex items-center gap-2 text-xs font-bold text-blue-800 cursor-pointer bg-white px-3 border border-blue-200 rounded hover:bg-blue-50">
          <input 
            type="checkbox" 
            v-model="showAll"
          />
          Show Inactive
        </label>
      </div>

      <select 
        class="w-full p-2 border rounded bg-white"
        @change="handleSelect"
        :size="filteredMembers.length > 10 ? 10 : Math.max(2, filteredMembers.length + 1)"
      >
        <option value="">
          -- {{ searchTerm ? `Found ${filteredMembers.length} matches` : "Select a Member" }} --
        </option>
        
        <option 
          v-for="m in filteredMembers" 
          :key="m.uid" 
          :value="m.uid" 
          class="py-1"
          :class="{ 'text-gray-400': m.status === 'Inactive' }"
        >
          <template v-if="m.status && m.status !== 'Active'">
            ** 
          </template>
          
          {{ m.lastName }}, {{ m.firstName }} 
        </option>
      </select>
      
      <p class="text-xs text-blue-800 mt-1">
        * Select a user to view their profile and add logs.
      </p>
    </div>
  </div>
</template>