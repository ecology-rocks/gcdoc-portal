<script setup>
import { ref, computed, watch } from 'vue'
import { collection, addDoc, query, where, getDocs, doc, deleteDoc, updateDoc, arrayUnion, setDoc } from "firebase/firestore"
import { db, auth } from '../firebase'
import { calculateRewards } from '../utils'

const props = defineProps({
  user: { type: Object, required: true },
  currentUserRole: String
})

const logs = ref([])
const date = ref('')
const hours = ref('')
const activity = ref('')
const editingId = ref(null)
const loading = ref(false)
const sheetPreview = ref(null)
const viewingHistory = ref(null)

// --- HELPERS ---
const toInputDate = (str) => {
  if (!str) return ''
  if (str.includes('/')) {
    const [m, d, y] = str.split('/')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return str
}

const toDisplayDate = (str) => {
  if (!str) return ''
  if (str.includes('-')) {
    const [y, m, d] = str.split('-')
    return `${m}/${d}/${y}`
  }
  return str
}

// --- DB REFS ---
const getCollectionRef = () => {
  if (props.user.type === 'legacy') {
    return collection(db, "legacy_members", props.user.realId, "legacyLogs")
  } else {
    return collection(db, "logs")
  }
}

const getDocRef = (logId) => {
  if (props.user.type === 'legacy') {
    return doc(db, "legacy_members", props.user.realId, "legacyLogs", logId)
  } else {
    return doc(db, "logs", logId)
  }
}

// --- ACTIONS ---
const fetchLogs = async () => {
  if (!props.user) return
  loading.value = true
  logs.value = []

  try {
    let data = []
    if (props.user.type === 'legacy') {
      const snap = await getDocs(getCollectionRef())
      data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    } else {
      const q = query(collection(db, "logs"), where("memberId", "==", props.user.uid))
      const snap = await getDocs(q)
      data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    }
    
    // Sort by date descending
    data.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    logs.value = data
  } catch (err) {
    console.error("Error fetching logs:", err)
  }
  loading.value = false
}

watch(() => props.user, fetchLogs, { immediate: true })

const handleViewSheet = async (sheetId) => {
  try {
    const q = query(collection(db, "volunteer_sheets"), where("sheetId", "==", sheetId))
    const snap = await getDocs(q)
    if (!snap.empty) {
      sheetPreview.value = snap.docs[0].data()
    } else {
      alert("Original sheet record not found.")
    }
  } catch (err) {
    alert("Error fetching sheet: " + err.message)
  }
}

const toggleRollover = async (log) => {
  try {
    const newVal = !log.applyToNextYear
    await updateDoc(getDocRef(log.id), { applyToNextYear: newVal })
    const idx = logs.value.findIndex(l => l.id === log.id)
    if (idx !== -1) logs.value[idx].applyToNextYear = newVal
  } catch (err) {
    alert("Error: " + err.message)
  }
}

const handleSubmit = async () => {
  if (!date.value || !hours.value || !activity.value) return
  
  const numHours = parseFloat(hours.value)
  const isAdmin = props.currentUserRole === 'admin'
  const newStatus = isAdmin ? 'approved' : 'pending'

  // Daily Limit Check
  const existingLogsForDate = logs.value.filter(l => 
    (l.date === date.value || toInputDate(l.date) === date.value) && l.id !== editingId.value
  )
  const dailySum = existingLogsForDate.reduce((sum, l) => sum + (parseFloat(l.hours) || 0), 0)
  const newDailyTotal = dailySum + numHours

  if (newDailyTotal > 8) {
    const confirm = window.confirm(
      `Total hours for ${date.value} will be ${newDailyTotal} hours.\nThis exceeds the 8-hour daily standard. Is this correct?`
    )
    if (!confirm) return
  }

  try {
    if (editingId.value) {
       // --- EDIT ---
       const logRef = getDocRef(editingId.value)
       const originalLog = logs.value.find(l => l.id === editingId.value)
       
       const historyEntry = {
          changedAt: new Date().toISOString(),
          changedBy: auth.currentUser.email,
          action: "edited",
          oldData: {
             date: originalLog.date,
             hours: originalLog.hours,
             activity: originalLog.activity,
             status: originalLog.status
          }
       }

       await updateDoc(logRef, {
         date: date.value, 
         hours: numHours, 
         activity: activity.value, 
         status: newStatus, 
         history: arrayUnion(historyEntry)
       })
       editingId.value = null
    } else {
       // --- CREATE ---
       const newLog = {
         date: date.value,
         hours: numHours,
         activity: activity.value,
         status: newStatus,
         submittedAt: new Date(),
         applyToNextYear: false,
         history: [{
           changedAt: new Date().toISOString(),
           changedBy: auth.currentUser.email,
           action: "created"
         }]
       }
       
       if (props.user.type !== 'legacy') {
         newLog.memberId = props.user.uid
       }

       await addDoc(getCollectionRef(), newLog)
    }
    
    date.value = ''
    hours.value = ''
    activity.value = ''
    
    if (!isAdmin) alert("Hours submitted for approval.")
    fetchLogs()
  } catch (err) {
    console.error("Error saving log:", err)
    alert("Failed to save log")
  }
}

const handleEdit = (log) => {
  date.value = toInputDate(log.date)
  hours.value = log.hours
  activity.value = log.activity
  editingId.value = log.id
}

const handleDelete = async (log) => {
  if(!window.confirm("Are you sure you want to delete this entry?")) return

  try {
    // 1. Archive the log before deleting
    // We create a copy in 'archived_logs' collection
    await setDoc(doc(db, "archived_logs", log.id), {
      ...log,
      deletedAt: new Date(),
      deletedBy: auth.currentUser.email,
      originalCollection: props.user.type === 'legacy' ? 'legacyLogs' : 'logs'
    })

    // 2. Delete the original
    await deleteDoc(getDocRef(log.id))
    fetchLogs()
  } catch (err) {
    console.error(err)
    alert("Error deleting: " + err.message)
  }
}

const cancelEdit = () => {
  editingId.value = null
  date.value = ''
  hours.value = ''
  activity.value = ''
}

const stats = computed(() => calculateRewards(logs.value, props.user.membershipType))
</script>

<template>
  <div class="mt-8">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div class="bg-indigo-600 text-white p-4 rounded shadow">
        <h4 class="text-indigo-200 text-xs font-bold uppercase">{{ stats.year }} Fiscal Hours</h4>
        <p class="text-3xl font-bold">{{ stats.totalHours }}</p>
        <p class="text-xs opacity-75 mt-1">(Oct 1 - Sep 30)</p>
      </div>
      <div class="bg-white p-4 rounded shadow border-l-4 border-green-500">
        <h4 class="text-gray-500 text-xs font-bold uppercase">Vouchers Earned</h4>
        <p class="text-3xl font-bold text-gray-800">{{ stats.vouchers }}</p>
      </div>
      <div class="bg-white p-4 rounded shadow border-l-4 border-blue-500">
        <h4 class="text-gray-500 text-xs font-bold uppercase">Membership Status</h4>
        <p class="text-xl font-bold text-gray-800 mt-1">{{ stats.membershipStatus }}</p>
      </div>
    </div>

    <h3 class="text-xl font-bold mb-4 text-gray-800">
       {{ editingId ? "Edit Entry" : "Log New Hours" }}
    </h3>
    
    <form @submit.prevent="handleSubmit" class="p-4 rounded mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end" :class="editingId ? 'bg-yellow-50 border border-yellow-400' : 'bg-gray-100'">
      <div>
        <label class="block text-xs font-bold text-gray-600 mb-1">Date</label>
        <input type="date" v-model="date" class="w-full p-2 border rounded" required />
      </div>
      <div class="md:col-span-2">
        <label class="block text-xs font-bold text-gray-600 mb-1">Activity</label>
        <input type="text" v-model="activity" class="w-full p-2 border rounded" required />
      </div>
      <div>
        <label class="block text-xs font-bold text-gray-600 mb-1">Hours</label>
        <div class="flex gap-2">
          <input type="number" step="0.25" v-model="hours" class="w-full p-2 border rounded" required />
          <button type="submit" class="text-white px-4 py-2 rounded hover:opacity-90 transition-colors" :class="editingId ? 'bg-yellow-600' : 'bg-green-600'">
            {{ editingId ? "Update" : "Add" }}
          </button>
        </div>
      </div>
      <div v-if="editingId" class="col-span-4 text-right">
        <button type="button" @click="cancelEdit" class="text-sm text-gray-500 underline">Cancel Edit</button>
      </div>
    </form>

    <div class="bg-white rounded shadow overflow-x-auto">
      <table class="w-full text-left min-w-[600px]">
        <thead class="bg-gray-200">
          <tr>
            <th class="p-3 text-sm font-semibold text-gray-700">Date</th>
            <th class="p-3 text-sm font-semibold text-gray-700">Activity</th>
            <th class="p-3 text-sm font-semibold text-gray-700 text-right">Hours</th>
            <th class="p-3 text-sm font-semibold text-gray-700">Status</th>
            <th v-if="currentUserRole === 'admin'" class="p-3 text-sm font-semibold text-gray-700 text-center">Roll Over</th>
            <th class="p-3 text-sm font-semibold text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="6" class="p-4 text-center text-gray-500">Loading...</td></tr>
          <tr v-else-if="logs.length === 0"><td colspan="6" class="p-4 text-center text-gray-500">No hours logged yet.</td></tr>
          <tr v-else v-for="log in logs" :key="log.id" class="border-t hover:bg-gray-50" :class="{ 'bg-purple-50': log.applyToNextYear }">
             <td class="p-3">{{ toDisplayDate(log.date) }}</td>
             <td class="p-3">{{ log.activity }}</td>
             <td class="p-3 text-right font-mono">{{ log.hours }}</td>
             <td class="p-3">
              <span class="text-xs px-2 py-1 rounded-full capitalize" 
                :class="{
                  'bg-orange-100 text-orange-800': log.status === 'pending',
                  'bg-green-100 text-green-800': log.status !== 'pending'
                }">
                {{ log.status || 'approved' }}
              </span>
             </td>
             
             <td v-if="currentUserRole === 'admin'" class="p-3 text-center">
               <input 
                 type="checkbox" 
                 :checked="log.applyToNextYear || false" 
                 @change="toggleRollover(log)"
                 class="cursor-pointer w-4 h-4"
               />
             </td>

             <td class="p-3 text-sm whitespace-nowrap flex items-center">
              <button @click="handleEdit(log)" class="text-blue-600 hover:underline mr-3">Edit</button>
              <button @click="handleDelete(log)" class="text-red-600 hover:underline mr-3">Delete</button>
              
              <button 
                v-if="currentUserRole === 'admin' && log.sourceSheetId"
                @click="handleViewSheet(log.sourceSheetId)"
                class="text-purple-600 hover:text-purple-800 text-xs border border-purple-200 px-2 py-1 rounded bg-purple-50 mr-2"
                :title="'View Source Sheet ' + log.sourceSheetId"
              >
                📄 {{ log.sourceSheetId }}
              </button>
              
              <button 
                v-if="log.history && log.history.length > 0"
                @click="viewingHistory = log" 
                class="text-gray-500 hover:text-gray-700 text-xs border border-gray-300 px-2 py-1 rounded bg-gray-50"
                title="View Edit History"
              >
                🕒 History
              </button>
             </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="viewingHistory" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white p-6 rounded shadow-lg w-full max-w-md">
        <div class="flex justify-between items-center mb-4 border-b pb-2">
          <h3 class="font-bold text-lg">Edit History</h3>
          <button @click="viewingHistory = null" class="text-gray-500 hover:text-gray-800">✕</button>
        </div>
        
        <div class="max-h-[300px] overflow-y-auto space-y-4">
          <div v-for="(entry, i) in viewingHistory.history.slice().reverse()" :key="i" class="text-sm border-l-2 border-gray-300 pl-3">
            <p class="text-gray-500 text-xs">
              {{ new Date(entry.changedAt).toLocaleString() }} 
              by <span class="font-semibold">{{ entry.changedBy }}</span>
            </p>
            <p class="font-bold text-xs uppercase text-blue-600 mb-1">{{ entry.action || 'changed' }}</p>
            
            <div v-if="entry.oldData" class="mt-1 text-gray-700 bg-gray-50 p-2 rounded">
              <p class="font-bold text-xs uppercase text-gray-400 mb-1">Previous Version:</p>
              <p>Date: {{ entry.oldData.date }}</p>
              <p>Activity: {{ entry.oldData.activity }}</p>
              <p>Hours: {{ entry.oldData.hours }}</p>
            </div>
          </div>
        </div>
        <div class="mt-4 text-right">
          <button @click="viewingHistory = null" class="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300">Close</button>
        </div>
      </div>
    </div>

    <div v-if="sheetPreview" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded shadow-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div class="flex justify-between items-center p-4 border-b">
          <h3 class="font-bold text-lg">Source Sheet: <span class="font-mono text-purple-700">{{ sheetPreview.sheetId }}</span></h3>
          <button @click="sheetPreview = null" class="text-gray-500 hover:text-red-600 text-2xl font-bold">×</button>
        </div>
        
        <div class="flex-1 bg-gray-100 overflow-auto p-4 flex justify-center">
           <img 
             :src="sheetPreview.imageUrl" 
             alt="Original Sheet" 
             class="max-w-full object-contain shadow border" 
           />
        </div>
        
        <div class="p-4 border-t text-right bg-gray-50">
           <a 
             :href="sheetPreview.imageUrl" 
             target="_blank" 
             rel="noreferrer"
             class="text-blue-600 hover:underline text-sm font-bold"
           >
             Open Full Size in New Tab
           </a>
        </div>
      </div>
    </div>

  </div>
</template>