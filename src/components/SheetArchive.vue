<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, orderBy, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore"
import { db } from '../firebase'

const props = defineProps({
  currentUser: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['resume'])

const sheets = ref([])
const loading = ref(true)
const previewSheet = ref(null) 

// --- FILTER STATE ---
const showAllUsers = ref(false) 
const showCompleted = ref(false)

onMounted(async () => {
  fetchSheets()
})

const fetchSheets = async () => {
  loading.value = true
  try {
    const q = query(collection(db, "volunteer_sheets"), orderBy("uploadedAt", "desc"))
    const snap = await getDocs(q)
    // Map data and handle "event" vs "name" legacy issues
    sheets.value = snap.docs.map(doc => {
      const data = doc.data()
      return { 
        id: doc.id, 
        ...data,
        // UI Helper: Use 'event' if it exists, otherwise 'name'
        displayTitle: data.event || data.name || 'Untitled Sheet' 
      }
    })
  } catch (err) {
    console.error("Error loading sheets:", err)
  }
  loading.value = false
}

// --- COMPUTED FILTERING ---
const filteredSheets = computed(() => {
  return sheets.value.filter(sheet => {
    // 1. Ownership Check
    const isMySheet = sheet.uploadedBy === props.currentUser.email
    if (!showAllUsers.value && !isMySheet) return false

    // 2. Status Check (Updated to check for 'done')
    const isDone = sheet.status === 'done' || sheet.status === 'completed'
    if (!showCompleted.value && isDone) return false

    return true
  })
})

// Check for sheets that don't have an owner record
const brokenSheetsCount = computed(() => {
  return sheets.value.filter(s => !s.uploadedBy).length
})

// --- ACTIONS ---
const handleRepair = async () => {
  if (!confirm(`Claim ${brokenSheetsCount.value} sheets as yours?`)) return
  
  loading.value = true
  try {
    const broken = sheets.value.filter(s => !s.uploadedBy)
    for (const sheet of broken) {
      await updateDoc(doc(db, "volunteer_sheets", sheet.id), {
        uploadedBy: props.currentUser.email,
        // Don't overwrite existing event/name if it exists
        event: sheet.event || sheet.name || "Recovered Sheet", 
        status: sheet.status || "pending"
      })
    }
    await fetchSheets() 
    alert("Success! Sheets claimed.")
  } catch (err) {
    alert("Error repairing: " + err.message)
  }
  loading.value = false
}

const handleDelete = async (sheetId) => {
  if (!confirm("Delete this sheet permanently? Logs created from it will remain.")) return
  try {
    await deleteDoc(doc(db, "volunteer_sheets", sheetId))
    sheets.value = sheets.value.filter(s => s.id !== sheetId)
    if (previewSheet.value && previewSheet.value.id === sheetId) {
      previewSheet.value = null
    }
  } catch (err) {
    alert("Error deleting: " + err.message)
  }
}

const toggleStatus = async (sheet) => {
  // Toggle between 'done' and 'pending'
  const isDone = sheet.status === 'done' || sheet.status === 'completed'
  const newStatus = isDone ? 'pending' : 'done'
  
  try {
    await updateDoc(doc(db, "volunteer_sheets", sheet.id), { status: newStatus })
    sheet.status = newStatus
  } catch (err) {
    console.error(err)
  }
}

const openPreview = (sheet) => {
  previewSheet.value = sheet
}
</script>

<template>
  <div class="mt-8 border-t pt-6">
    <div class="flex flex-col md:flex-row justify-between items-end mb-4 gap-4">
      <div>
        <h3 class="text-lg font-bold text-gray-700">Sheet Archive</h3>
        <p class="text-xs text-gray-500">Resume data entry or review past uploads.</p>
      </div>

      <div v-if="brokenSheetsCount > 0" class="bg-red-100 border border-red-300 p-2 rounded flex items-center gap-2">
        <span class="text-xs text-red-800 font-bold">⚠️ {{ brokenSheetsCount }} sheets missing owner data.</span>
        <button @click="handleRepair" class="bg-red-600 text-white text-xs px-3 py-1 rounded font-bold hover:bg-red-700">
          Claim & Repair
        </button>
      </div>

      <div class="flex gap-4 bg-gray-50 p-2 rounded border border-gray-200">
        <label class="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 select-none">
          <input type="checkbox" v-model="showAllUsers" class="rounded text-blue-600 focus:ring-blue-500">
          Show Non-Owned
        </label>
        <div class="w-px bg-gray-300 h-4 self-center"></div>
        <label class="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 select-none">
          <input type="checkbox" v-model="showCompleted" class="rounded text-blue-600 focus:ring-blue-500">
          Show Completed
        </label>
      </div>
    </div>

    <div v-if="loading" class="text-gray-500 text-sm italic">Loading sheets...</div>
    
    <div v-else-if="filteredSheets.length === 0" class="p-6 text-center bg-gray-50 rounded border border-dashed border-gray-300 text-gray-500">
      <p>No sheets found matching your filters.</p>
      <p class="text-xs mt-1">(Try checking the boxes above to see more)</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div 
        v-for="sheet in filteredSheets" 
        :key="sheet.id" 
        class="border rounded bg-white p-3 shadow-sm hover:shadow-md transition relative flex flex-col"
        :class="(sheet.status === 'done' || sheet.status === 'completed') ? 'opacity-75 bg-gray-50' : 'border-blue-200'"
      >
      <div class="text-[10px] font-mono text-purple-600 mb-1">
    ID: {{ sheet.sheetId || 'No ID' }}
  </div>
  <h4 class="font-bold text-gray-800 text-sm mb-1 truncate pr-16">{{ sheet.displayTitle }}</h4>
        <div class="absolute top-2 right-2 cursor-pointer" @click="toggleStatus(sheet)" title="Click to toggle status">
          <span v-if="sheet.status === 'done' || sheet.status === 'completed'" class="text-[10px] font-bold bg-green-100 text-green-800 px-2 py-1 rounded-full border border-green-200 hover:bg-green-200">
            DONE
          </span>
          <span v-else class="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded-full border border-blue-200 hover:bg-blue-200">
            IN PROGRESS
          </span>
        </div>

        <h4 class="font-bold text-gray-800 text-sm mb-1 truncate pr-16">{{ sheet.displayTitle }}</h4>
        
        <p class="text-xs text-gray-500 mb-2">
          Uploaded by: <span class="font-semibold">{{ sheet.uploadedBy === currentUser.email ? 'Me' : (sheet.uploadedByName || sheet.uploadedBy || 'Unknown') }}</span><br>
          {{ sheet.uploadedAt ? new Date(sheet.uploadedAt.seconds * 1000).toLocaleDateString() : 'Unknown Date' }}
        </p>

        <div 
          @click="openPreview(sheet)"
          class="bg-gray-100 h-32 rounded mb-3 overflow-hidden flex items-center justify-center border cursor-zoom-in group"
        >
          <img :src="sheet.imageUrl" class="object-cover w-full h-full opacity-90 group-hover:opacity-100 transition duration-300 group-hover:scale-105" />
        </div>

        <div class="mt-auto flex gap-2">
          <button 
            @click="emit('resume', sheet)"
            class="flex-1 text-center py-1.5 rounded text-xs font-bold transition-colors"
            :class="(sheet.status === 'done' || sheet.status === 'completed') ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' : 'bg-blue-600 text-white hover:bg-blue-700'"
          >
            {{ (sheet.status === 'done' || sheet.status === 'completed') ? 'Review' : 'Resume Entry' }}
          </button>
          
          <button 
            @click="handleDelete(sheet.id)"
            class="px-3 py-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
            title="Delete Sheet"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>

    <div v-if="previewSheet" class="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[60] p-4" @click.self="previewSheet = null">
      <div class="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
        <div class="flex justify-between items-center p-4 border-b bg-gray-50">
          <div>
            <h3 class="font-bold text-lg text-gray-800">{{ previewSheet.displayTitle }}</h3>
          </div>
          <button @click="previewSheet = null" class="text-gray-400 hover:text-red-500 text-3xl font-bold leading-none">&times;</button>
        </div>
        <div class="flex-1 overflow-auto bg-gray-900 flex items-center justify-center p-4">
          <img :src="previewSheet.imageUrl" class="max-w-full max-h-full object-contain shadow-lg" />
        </div>
        <div class="p-4 border-t bg-gray-50 flex justify-between items-center">
          <a :href="previewSheet.imageUrl" target="_blank" class="text-blue-600 hover:underline text-sm font-bold">Open Original</a>
          <button 
            @click="emit('resume', previewSheet); previewSheet = null"
            class="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700"
          >
            Resume Entry
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.animate-scale-in {
  animation: scaleIn 0.2s ease-out;
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>