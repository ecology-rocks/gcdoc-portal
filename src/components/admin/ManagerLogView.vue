<script setup>
import { ref, computed, onMounted } from 'vue'
import { collection, query, getDocs, orderBy, doc, updateDoc, deleteDoc } from "firebase/firestore"
import { db } from '../../firebase'
import { downloadCSV } from '../../utils'

const props = defineProps({
  currentUserRole: String // 'manager' or 'admin'
})

const logs = ref([])
const membersMap = ref({}) 
const loading = ref(false)
const emailCopyStatus = ref('')

// Filters
const startDate = ref('')
const endDate = ref('')
const filterMode = ref('all') 

const fetchData = async () => {
  loading.value = true
  logs.value = []
  membersMap.value = {}
  
  try {
    const logQ = query(collection(db, "logs"), orderBy("date", "desc"))
    const logSnap = await getDocs(logQ)
    logs.value = logSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    const memQ = query(collection(db, "members"))
    const memSnap = await getDocs(memQ)
    
    const map = {}
    memSnap.forEach(doc => {
      const data = doc.data()
      map[doc.id] = {
        name: `${data.firstName || 'Unknown'} ${data.lastName || ''}`.trim(),
        email: data.email || ''
      }
    })
    membersMap.value = map

  } catch (err) {
    console.error("Error fetching data:", err)
  }
  loading.value = false
}

// --- ACTIONS ---

const handleExport = () => {
  // Re-map the data to a clean format for the shared tool
  const rows = filteredLogs.value.map(log => {
    const member = membersMap.value[log.memberId] || { name: 'Unknown', email: '' }
    return {
      Date: log.date,
      Member: member.name,
      Email: member.email,
      Activity: log.activity,
      Hours: log.hours,
      Status: log.status
    }
  })
  downloadCSV(rows, `manager_logs_export_${new Date().toISOString().slice(0,10)}.csv`)
}


const handleApprove = async (log) => {
  if (!confirm("Approve this entry?")) return // Optional safety check

  try {
    await updateDoc(doc(db, "logs", log.id), { status: 'approved' })
    
    // Update local state immediately
    const target = logs.value.find(l => l.id === log.id)
    if (target) target.status = 'approved'
    
  } catch (err) {
    alert("Error approving: " + err.message)
  }
}

const handleDelete = async (log) => {
  if (!confirm("Are you sure you want to PERMANENTLY delete this log?")) return

  try {
    await deleteDoc(doc(db, "logs", log.id))
    
    // Remove from local list
    logs.value = logs.value.filter(l => l.id !== log.id)
    
  } catch (err) {
    alert("Error deleting: " + err.message)
  }
}

const copyEmail = async (email) => {
  if (!email) return alert("No email found for this user.")
  try {
    await navigator.clipboard.writeText(email)
    emailCopyStatus.value = `Copied ${email}!`
    setTimeout(() => emailCopyStatus.value = '', 2000)
  } catch (err) {
    console.error(err)
  }
}

// --- COMPUTED ---
const filteredLogs = computed(() => {
  return logs.value.filter(log => {
    if (startDate.value && log.date < startDate.value) return false
    if (endDate.value && log.date > endDate.value) return false

    if (filterMode.value === 'maintenance') return log.isMaintenance === true
    if (filterMode.value === 'other') return !log.isMaintenance

    return true
  })
})

const totalHours = computed(() => {
  return filteredLogs.value.reduce((sum, log) => sum + (parseFloat(log.hours) || 0), 0)
})

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="p-6 bg-white rounded shadow">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
      <h2 class="text-2xl font-bold text-gray-800">Manager Log Audit</h2>
      
      <div class="flex items-center gap-4">
        <span v-if="emailCopyStatus" class="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200 animate-pulse">
          {{ emailCopyStatus }}
        </span>
        <button 
          @click="handleExport"
          class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm font-bold flex items-center"
        >
          <span>⬇ Export CSV</span>
        </button>
      </div>
    </div>

    <div class="bg-gray-50 p-4 rounded border border-gray-200 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
      <div>
        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">From Date</label>
        <input type="date" v-model="startDate" class="w-full p-2 border rounded bg-white" />
      </div>
      <div>
        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">To Date</label>
        <input type="date" v-model="endDate" class="w-full p-2 border rounded bg-white" />
      </div>
      <div>
        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">View Mode</label>
        <select v-model="filterMode" class="w-full p-2 border rounded bg-white">
          <option value="all">All Records</option>
          <option value="maintenance">Cleaning & Maintenance</option>
          <option value="other">Other (Trial/Standard)</option>
        </select>
      </div>
      <div class="flex flex-col justify-end">
        <div class="bg-white border p-2 rounded text-right">
          <span class="text-xs text-gray-500 uppercase font-bold">Total Selected</span>
          <div class="text-xl font-mono font-bold text-indigo-600">{{ totalHours.toFixed(2) }} Hrs</div>
        </div>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-gray-100 text-gray-600 uppercase text-xs">
          <tr>
            <th class="p-3">Date</th>
            <th class="p-3">Member</th>
            <th class="p-3">Activity</th>
            <th class="p-3 text-right">Hours</th>
            <th class="p-3">Status</th>
            <th v-if="currentUserRole === 'admin'" class="p-3 text-right">Admin</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-if="loading">
            <td colspan="6" class="p-4 text-center text-gray-500">Loading records...</td>
          </tr>
          <tr v-else-if="filteredLogs.length === 0">
            <td colspan="6" class="p-4 text-center text-gray-500">No logs match your filters.</td>
          </tr>
          <tr 
            v-for="log in filteredLogs" 
            :key="log.id" 
            class="hover:bg-gray-50"
            :class="{'bg-green-50': log.isMaintenance}"
          >
            <td class="p-3 font-mono text-gray-600 whitespace-nowrap">{{ log.date }}</td>
            
            <td class="p-3">
              <div class="flex items-center gap-2">
                <span class="font-bold text-gray-800">
                  {{ membersMap[log.memberId]?.name || 'Unknown' }}
                </span>
                <button 
                  v-if="membersMap[log.memberId]?.email"
                  @click="copyEmail(membersMap[log.memberId].email)"
                  title="Copy Email"
                  class="text-gray-400 hover:text-blue-600 text-xs"
                >
                  📋
                </button>
              </div>
            </td>

            <td class="p-3 text-gray-800">
              {{ log.activity }}
              <span v-if="log.isMaintenance" class="ml-2 text-[10px] uppercase font-bold text-green-700 border border-green-300 px-1 rounded bg-white">
                 Maint
               </span>
            </td>
            
            <td class="p-3 text-right font-bold">{{ log.hours }}</td>
            
            <td class="p-3">
              <div v-if="log.status !== 'approved'" class="flex items-center gap-2">
                <label class="flex items-center cursor-pointer bg-orange-100 px-2 py-1 rounded border border-orange-200 hover:bg-orange-200 transition">
                  <input 
                    type="checkbox" 
                    @change="handleApprove(log)" 
                    class="mr-2 cursor-pointer"
                  />
                  <span class="text-xs font-bold text-orange-800 uppercase">Approve?</span>
                </label>
              </div>
              <span v-else class="text-xs text-green-700 font-bold uppercase bg-green-50 border border-green-200 px-2 py-1 rounded">
                ✓ Approved
              </span>
            </td>

            <td v-if="currentUserRole === 'admin'" class="p-3 text-right">
              <button 
                @click="handleDelete(log)"
                class="text-red-400 hover:text-red-600 font-bold text-lg px-2"
                title="Permanently Delete Log"
              >
                &times;
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>