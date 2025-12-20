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
  
  const membersSnap = await getDocs(collection(db, "members"))
  const registered = membersSnap.docs.map(doc => ({
    uid: doc.id,
    type: 'registered',
    ...doc.data()
  }))

  const legacySnap = await getDocs(collection(db, "legacy_members"))
  const legacy = legacySnap.docs.map(doc => ({
    uid: "LEGACY_" + doc.id,
    realId: doc.id,
    type: 'legacy',
    ...doc.data()
  }))

  const all = [...registered, ...legacy].sort((a, b) => 
    (a.lastName || "").localeCompare(b.lastName || "")
  )
  
  combinedMembers.value = all
  loading.value = false
})

const filteredMembers = computed(() => {
  return combinedMembers.value.filter(m => {
    // 1. Check Status
    if (!showAll.value && m.status && m.status !== 'Active') return false

    // 2. Check Search Term
    const search = searchTerm.value.toLowerCase()
    const fullString = `${m.firstName} ${m.lastName} ${m.firstName2 || ''} ${m.lastName2 || ''} ${m.email}`.toLowerCase()
    return fullString.includes(search)
  })
})

const handleSelect = (event) => {
  const selectedUid = event.target.value
  const selected = combinedMembers.value.find(m => m.uid === selectedUid)
  emit('select', selected || null)
}
</script>

<template>
  <div class="bg-blue-50 p-4 rounded border border-blue-200 mb-6">
    <h3 class="text-sm font-bold text-blue-800 mb-2 uppercase tracking-wide">
      Admin Mode: Log hours for others
    </h3>
    
    <p v-if="loading" class="text-sm text-blue-600">Loading member list...</p>
    
    <div v-else>
      <div class="flex flex-col md:flex-row gap-2 mb-2">
        <input 
          type="text"
          placeholder="Search by Name..."
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
          :class="{ 'text-gray-400': m.status && m.status !== 'Active' }"
        >
          {{ m.status && m.status !== 'Active' ? `[${m.status.toUpperCase()}]` : "" }} 
          {{ m.lastName }}, {{ m.firstName }} 
          {{ m.firstName2 ? `& ${m.lastName2 && m.lastName2 !== m.lastName ? m.lastName2 + ', ' : ''}${m.firstName2}` : '' }} 
          {{ m.type === 'legacy' ? "(Not Registered)" : "(Active)" }} 
          {{ m.membershipType ? `(${m.membershipType})` : "" }}
        </option>
      </select>
    </div>
  </div>
</template>