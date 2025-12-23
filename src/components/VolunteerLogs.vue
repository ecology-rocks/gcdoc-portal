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
const category = ref('standard') 
const editingId = ref(null)
const loading = ref(false)
const sheetPreview = ref(null)
const viewingHistory = ref(null)

// --- CONFIGURATION ---
const CATEGORIES = {
  standard: { label: 'Standard Volunteer', multiplier: 1, isMaintenance: false },
  trial:    { label: 'Trial Set Up / Tear Down', multiplier: 2, isMaintenance: false },
  maint:    { label: 'General Maintenance', multiplier: 2, isMaintenance: true },
  cleaning: { label: 'Cleaning', multiplier: 2, isMaintenance: true }
}

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

// --- COMPUTED PREVIEW ---
const calculatedCredit = computed(() => {
  const h = parseFloat(hours.value) || 0
  const rule = CATEGORIES[category.value]
  return h * rule.multiplier
})

const isBlueRibbon = computed(() => CATEGORIES[category.value].isMaintenance)
const isStaff = computed(() => props.currentUserRole === 'admin' || props.currentUserRole === 'manager')

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
    // Search by the custom 'sheetId' field
    const q = query(collection(db, "volunteer_sheets"), where("sheetId", "==", sheetId))
    const snap = await getDocs(q)
    if (!snap.empty) {
      sheetPreview.value = snap.docs[0].data()
    } else {
      alert(`Sheet with ID "${sheetId}" not found in database.`)
    }
  } catch (err) {
    alert("Error fetching sheet: " + err.message)
  }
}

// --- NEW: LINK LOG TO SHEET ---
const handleLinkSheet = async (log) => {
  const input = prompt("Enter the Sheet ID to link this log to (e.g., #8949):")
  if (!input) return

  try {
    await updateDoc(getDocRef(log.id), { sourceSheetId: input.trim() })
    // Update local state
    const target = logs.value.find(l => l.id === log.id)
    if (target) target.sourceSheetId = input.trim()
  } catch (err) {
    alert("Error linking: " + err.message)
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
  
  const finalHours = calculatedCredit.value
  const maintenanceFlag = isBlueRibbon.value
  
  const autoApprove = isStaff.value
  const newStatus = autoApprove ? 'approved' : 'pending'

  // Daily Limit Check
  const existingLogsForDate = logs.value.filter(l => 
    (l.date === date.value || toInputDate(l.date) === date.value) && l.id !== editingId.value
  )
  const dailySum = existingLogsForDate.reduce((sum, l) => sum + (parseFloat(l.hours) || 0), 0)
  const newDailyTotal = dailySum + finalHours

  if (newDailyTotal > 8) {
    const confirm = window.confirm(
      `Total CREDIT for ${date.value} will be ${newDailyTotal} hours.\nThis exceeds the 8-hour daily standard. Is this correct?`
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
             status: originalLog.status,
             isMaintenance: originalLog.isMaintenance || false
          }
       }

       await updateDoc(logRef, {
         date: date.value, 
         hours: finalHours,
         activity: activity.value,
         isMaintenance: maintenanceFlag, 
         status: newStatus, 
         history: arrayUnion(historyEntry)
       })
       editingId.value = null
    } else {
       // --- CREATE ---
       const newLog = {
         date: date.value,
         hours: finalHours,
         activity: activity.value,
         isMaintenance: maintenanceFlag,
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
    category.value = 'standard'
    
    if (!autoApprove) alert("Hours submitted for approval.")
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
  
  if (log.isMaintenance) {
    category.value = 'maint' 
  } else {
    category.value = 'standard'
  }
  
  editingId.value = log.id
}

const handleDelete = async (log) => {
  if(!window.confirm("Are you sure you want to delete this entry?")) return

  try {
    await setDoc(doc(db, "archived_logs", log.id), {
      ...log,
      deletedAt: new Date(),
      deletedBy: auth.currentUser.email,
      originalCollection: props.user.type === 'legacy' ? 'legacyLogs' : 'logs'
    })
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
  category.value = 'standard'
}

// --- STATS ---
const stats = computed(() => calculateRewards(logs.value, props.user.membershipType))

const maintenanceStats = computed(() => {
  const maintHours = logs.value
    .filter(l => l.isMaintenance)
    .reduce((sum, l) => sum + (parseFloat(l.hours) || 0), 0)
  
  return {
    hours: maintHours,
    ribbons: Math.floor(maintHours / 8)
  }
})
</script>

<template>
  <div class="mt-8">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-indigo-600 text-white p-4 rounded shadow">
        <h4 class="text-indigo-200 text-xs font-bold uppercase">{{ stats.year }} Fiscal Hours</h4>
        <p class="text-3xl font-bold">{{ stats.totalHours }}</p>
        <p class="text-xs opacity-75 mt-1">(Oct 1 - Sep 30)</p>
      </div>
      <div class="bg-white p-4 rounded shadow border-l-4 border-green-500">
        <h4 class="text-gray-500 text-xs font-bold uppercase">Standard Vouchers</h4>
        <p class="text-3xl font-bold text-gray-800">{{ stats.vouchers }}</p>
      </div>
      <div class="bg-green-50 p-4 rounded shadow border-l-4 border-green-700">
        <h4 class="text-green-800 text-xs font-bold uppercase">Blue Ribbons 🏆</h4>
        <p class="text-3xl font-bold text-green-900">{{ maintenanceStats.ribbons }}</p>
        <p class="text-xs text-green-700 mt-1">{{ maintenanceStats.hours }} Maint. Hours</p>
      </div>
      <div class="bg-white p-4 rounded shadow border-l-4 border-blue-500">
        <h4 class="text-gray-500 text-xs font-bold uppercase">Membership Status</h4>
        <p class="text-xl font-bold text-gray-800 mt-1">{{ stats.membershipStatus }}</p>
      </div>
    </div>

    <h3 class="text-xl font-bold mb-4 text-gray-800">
       {{ editingId ? "Edit Entry" : "Log New Hours" }}
    </h3>
    
    <form @submit.prevent="handleSubmit" class="p-4 rounded mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-start" :class="editingId ? 'bg-yellow-50 border border-yellow-400' : 'bg-gray-100'">
      
      <div>
        <label class="block text-xs font-bold text-gray-600 mb-1">Date</label>
        <input type="date" v-model="date" class="w-full p-2 border rounded" required />
      </div>

      <div class="md:col-span-2">
        <label class="block text-xs font-bold text-gray-600 mb-1">Activity Description</label>
        <input type="text" v-model="activity" class="w-full p-2 border rounded" placeholder="e.g. Cleaned mats, Set up rings" required />
        
        <label class="block text-xs font-bold text-gray-600 mt-3 mb-1">Credit Category</label>
        <select v-model="category" class="w-full p-2 border rounded bg-white">
          <option value="standard">Standard Volunteer (1x Credit)</option>
          <option value="trial">Trial Set Up / Tear Down (2x Credit)</option>
          <option value="maint">General Maintenance (2x + Blue Ribbon)</option>
          <option value="cleaning">Cleaning (2x + Blue Ribbon)</option>
        </select>
      </div>

      <div>
        <label class="block text-xs font-bold text-gray-600 mb-1">Actual Clock Hours</label>
        <div class="flex flex-col gap-2">
          <input 
            type="number" 
            step="0.25" 
            v-model="hours" 
            class="w-full p-2 border rounded" 
            placeholder="Time worked"
            required 
          />
          
          <div v-if="hours" class="text-xs bg-white border px-2 py-1 rounded shadow-sm">
             <span class="block text-gray-500">Credited: <strong class="text-black text-sm">{{ calculatedCredit }} hrs</strong></span>
             <span v-if="CATEGORIES[category].multiplier > 1" class="text-purple-600 font-bold block">
               (Doubled)
             </span>
             <span v-if="isBlueRibbon" class="text-green-600 font-bold block">
               + Blue Ribbon
             </span>
          </div>

          <button type="submit" class="text-white px-4 py-2 rounded hover:opacity-90 transition-colors shadow mt-1" :class="editingId ? 'bg-yellow-600' : 'bg-green-600'">
            {{ editingId ? "Update" : "Submit" }}
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
            <th class="p-3 text-sm font-semibold text-gray-700 text-right">Credited</th>
            <th class="p-3 text-sm font-semibold text-gray-700">Status</th>
            <th v-if="isStaff" class="p-3 text-sm font-semibold text-gray-700 text-center">Rollover</th>
            <th class="p-3 text-sm font-semibold text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="6" class="p-4 text-center text-gray-500">Loading...</td></tr>
          <tr v-else-if="logs.length === 0"><td colspan="6" class="p-4 text-center text-gray-500">No hours logged yet.</td></tr>
          
          <tr 
            v-else 
            v-for="log in logs" 
            :key="log.id" 
            class="border-t hover:opacity-100 transition-colors"
            :class="{ 
              'bg-green-50 hover:bg-green-100': log.isMaintenance,
              'bg-purple-50 hover:bg-purple-100': log.applyToNextYear && !log.isMaintenance,
              'hover:bg-gray-50': !log.isMaintenance && !log.applyToNextYear
            }"
          >
             <td class="p-3">{{ toDisplayDate(log.date) }}</td>
             <td class="p-3">
               {{ log.activity }}
               <span v-if="log.isMaintenance" class="ml-2 text-[10px] uppercase font-bold text-green-700 border border-green-300 px-1 rounded bg-white">
                 Maintenance
               </span>
             </td>
             <td class="p-3 text-right font-mono font-bold">{{ log.hours }}</td>
             <td class="p-3">
              <span class="text-xs px-2 py-1 rounded-full capitalize" 
                :class="{
                  'bg-orange-100 text-orange-800': log.status === 'pending',
                  'bg-white border border-gray-300 text-gray-600': log.status !== 'pending'
                }">
                {{ log.status || 'approved' }}
              </span>
             </td>
             
             <td v-if="isStaff" class="p-3 text-center">
               <input 
                 type="checkbox" 
                 :checked="log.applyToNextYear || false" 
                 @change="toggleRollover(log)"
                 class="cursor-pointer w-4 h-4"
               />
             </td>

             <td class="p-3 text-sm whitespace-nowrap flex items-center">
              <button @click="handleEdit(log)" class="text-blue-600 hover:underline mr-3 font-bold">Edit</button>
              <button @click="handleDelete(log)" class="text-red-600 hover:underline mr-3">Delete</button>
              
              <button 
                v-if="isStaff && log.sourceSheetId"
                @click="handleViewSheet(log.sourceSheetId)"
                class="text-purple-600 hover:text-purple-800 text-xs border border-purple-200 px-2 py-1 rounded bg-purple-50 mr-2"
                :title="'View Source Sheet ' + log.sourceSheetId"
              >
                📄 {{ log.sourceSheetId }}
              </button>

              <button 
                v-if="isStaff && !log.sourceSheetId"
                @click="handleLinkSheet(log)"
                class="text-gray-400 hover:text-purple-600 text-xs border border-dashed border-gray-300 px-2 py-1 rounded hover:bg-purple-50 mr-2"
                title="Manually Link to Sheet"
              >
                🔗 Link
              </button>
              
              <button 
                v-if="log.history && log.history.length > 0"
                @click="viewingHistory = log" 
                class="text-gray-500 hover:text-gray-700 text-xs border border-gray-300 px-2 py-1 rounded bg-white"
                title="View Edit History"
              >
                🕒
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
              <p v-if="entry.oldData.isMaintenance">Type: Maintenance</p>
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