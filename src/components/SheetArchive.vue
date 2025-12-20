<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, orderBy, getDocs, writeBatch, doc, where, collectionGroup, updateDoc } from "firebase/firestore"
import { ref as storageRef, deleteObject } from "firebase/storage"
import { db, storage } from '../firebase'

const emit = defineEmits(['resume'])

const sheets = ref([])
const loading = ref(true)
const deletingId = ref(null)

// Filters
const searchTerm = ref("")
const showCompleted = ref(false)
const displayLimit = ref(12)

onMounted(async () => {
  try {
    const q = query(collection(db, "volunteer_sheets"), orderBy("date", "desc"))
    const snap = await getDocs(q)
    sheets.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error("Error fetching sheets:", err)
  }
  loading.value = false
})

const handleFullDelete = async (sheet) => {
  if(!window.confirm(`WARNING: This will delete the sheet record AND remove all hours logged using this sheet ID (${sheet.sheetId}).\n\nAre you sure?`)) return
  
  deletingId.value = sheet.id
  try {
    const batch = writeBatch(db)

    if (sheet.sheetId) {
      const logsQ = query(collection(db, "logs"), where("sourceSheetId", "==", sheet.sheetId))
      const logsSnap = await getDocs(logsQ)
      logsSnap.forEach(doc => batch.delete(doc.ref))

      const legacyQ = query(collectionGroup(db, "legacyLogs"), where("sourceSheetId", "==", sheet.sheetId))
      const legacySnap = await getDocs(legacyQ)
      legacySnap.forEach(doc => batch.delete(doc.ref))
    }

    const sheetRef = doc(db, "volunteer_sheets", sheet.id)
    batch.delete(sheetRef)
    await batch.commit()

    if (sheet.imageUrl) {
      try {
        const fileRef = storageRef(storage, sheet.imageUrl)
        await deleteObject(fileRef)
      } catch (storageErr) {
        console.warn("Could not delete image file:", storageErr)
      }
    }

    sheets.value = sheets.value.filter(s => s.id !== sheet.id)
    alert("Sheet and associated log entries deleted.")

  } catch (err) {
    console.error(err)
    alert("Error deleting: " + err.message)
  }
  deletingId.value = null
}

const toggleComplete = async (sheet) => {
  const newStatus = sheet.status === 'done' ? 'processing' : 'done'
  
  // Optimistic Update
  const idx = sheets.value.findIndex(s => s.id === sheet.id)
  if (idx !== -1) sheets.value[idx].status = newStatus

  try {
    await updateDoc(doc(db, "volunteer_sheets", sheet.id), { status: newStatus })
  } catch (err) {
    console.error("Error updating status:", err)
    alert("Failed to save status.")
  }
}

const filteredSheets = computed(() => {
  return sheets.value.filter(sheet => {
    const search = searchTerm.value.toLowerCase()
    const matchId = (sheet.sheetId || "").toLowerCase().includes(search)
    const matchEvent = (sheet.event || "").toLowerCase().includes(search)
    const matchesSearch = matchId || matchEvent

    const isHidden = !showCompleted.value && sheet.status === 'done'
    return matchesSearch && !isHidden
  })
})

const visibleSheets = computed(() => {
  return filteredSheets.value.slice(0, displayLimit.value)
})
</script>

<template>
  <div class="mt-4">
    <div v-if="loading" class="p-4 text-gray-500">Loading archive...</div>

    <div v-else>
      <div class="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
        <div>
           <h3 class="text-xl font-bold text-gray-800">📂 Sheet Archive</h3>
           <p class="text-xs text-gray-500">Manage uploaded logs and resume data entry.</p>
        </div>

        <div class="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer bg-gray-50 px-3 py-2 rounded border">
            <input type="checkbox" v-model="showCompleted" />
            Show Completed
          </label>
          <input 
            type="text" 
            placeholder="Search ID (#4021) or Event..." 
            class="border rounded p-2 text-sm w-full md:w-64"
            v-model="searchTerm"
          />
        </div>
      </div>
      
      <div v-if="visibleSheets.length === 0" class="text-gray-500 italic p-8 text-center bg-gray-50 rounded border border-dashed">
        No sheets found matching your filters.
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div 
          v-for="sheet in visibleSheets" 
          :key="sheet.id" 
          class="border rounded shadow-sm flex flex-col p-4 relative transition-opacity"
          :class="sheet.status === 'done' ? 'bg-gray-50 border-gray-200 opacity-75' : 'bg-white border-gray-300'"
        >
          <div class="flex justify-between items-start mb-2">
            <span 
              class="text-lg font-mono font-bold px-2 py-1 rounded border"
              :class="sheet.status === 'done' ? 'bg-gray-200 text-gray-500 border-gray-300' : 'bg-yellow-100 text-yellow-800 border-yellow-200'"
            >
              {{ sheet.sheetId || "N/A" }}
            </span>
            
            <label class="flex items-center gap-1 cursor-pointer text-xs font-bold text-gray-500 hover:text-green-600">
              <input 
                type="checkbox" 
                :checked="sheet.status === 'done'" 
                @change="toggleComplete(sheet)"
                class="cursor-pointer"
              />
              {{ sheet.status === 'done' ? "Done" : "Mark Done" }}
            </label>
          </div>

          <p class="font-bold text-gray-800 text-sm truncate">{{ sheet.event || "Unnamed Event" }}</p>
          <p class="text-xs text-gray-500 mb-4">{{ sheet.date }}</p>
          
          <div class="flex gap-2 mt-auto">
            <a 
              :href="sheet.imageUrl" 
              target="_blank" 
              class="flex-1 text-center bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-bold py-2 rounded border border-gray-300"
            >
              View
            </a>

            <button 
              v-if="sheet.status !== 'done'"
              @click="$emit('resume', sheet)" 
              class="flex-1 bg-green-50 text-green-600 hover:bg-green-100 text-xs font-bold py-2 rounded border border-green-200"
            >
              Resume
            </button>
            
            <button 
              @click="handleFullDelete(sheet)" 
              :disabled="deletingId === sheet.id"
              class="flex-1 bg-white text-red-400 hover:text-red-600 hover:bg-red-50 text-xs font-bold py-2 rounded border border-gray-200 hover:border-red-200"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <div v-if="filteredSheets.length > displayLimit" class="mt-6 text-center">
        <button 
          @click="displayLimit += 12"
          class="text-blue-600 font-bold hover:underline"
        >
          Show More ({{ filteredSheets.length - displayLimit }} remaining)
        </button>
      </div>
    </div>
  </div>
</template>