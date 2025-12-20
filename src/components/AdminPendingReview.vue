<script setup>
import { ref, onMounted } from 'vue'
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore"
import { db } from '../firebase'

const pendingLogs = ref([])
const loading = ref(true)
const actionStatus = ref("")

const fetchPendingLogs = async () => {
  loading.value = true
  try {
    // 1. Fetch ALL Pending Logs
    const q = query(collection(db, "logs"), where("status", "==", "pending"))
    const querySnapshot = await getDocs(q)
    
    const rawLogs = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    if (rawLogs.length === 0) {
      pendingLogs.value = []
      loading.value = false
      return
    }

    // 2. We need names!
    const memberSnap = await getDocs(collection(db, "members"))
    const memberMap = {}
    memberSnap.forEach(doc => {
      const d = doc.data()
      memberMap[doc.id] = `${d.lastName}, ${d.firstName}`
    })

    // 3. Attach names to logs
    const enrichedLogs = rawLogs.map(log => ({
      ...log,
      memberName: memberMap[log.memberId] || "Unknown User"
    }))

    // Sort by Date
    enrichedLogs.sort((a, b) => new Date(a.date) - new Date(b.date))

    pendingLogs.value = enrichedLogs
  } catch (err) {
    console.error(err)
    actionStatus.value = "Error loading logs."
  }
  loading.value = false
}

onMounted(fetchPendingLogs)

const handleApprove = async (logId) => {
  try {
    actionStatus.value = "Approving..."
    const logRef = doc(db, "logs", logId)
    
    await updateDoc(logRef, { status: "approved" })
    
    // Remove from local list immediately
    pendingLogs.value = pendingLogs.value.filter(l => l.id !== logId)
    actionStatus.value = "Approved!"
    
    setTimeout(() => actionStatus.value = "", 2000)
  } catch (err) {
    alert("Error approving: " + err.message)
  }
}

const handleReject = async (logId) => {
  if (!window.confirm("Are you sure you want to DELETE this log entry? This cannot be undone.")) return
  try {
    actionStatus.value = "Deleting..."
    await deleteDoc(doc(db, "logs", logId))
    pendingLogs.value = pendingLogs.value.filter(l => l.id !== logId)
    actionStatus.value = "Deleted."
    setTimeout(() => actionStatus.value = "", 2000)
  } catch (err) {
    alert("Error deleting: " + err.message)
  }
}
</script>

<template>
  <div v-if="loading" class="p-4 text-gray-500 italic">Checking for pending items...</div>
  
  <div v-else-if="pendingLogs.length > 0" class="bg-orange-50 border-l-4 border-orange-400 p-4 mb-8 shadow-sm rounded-r">
    <div class="flex justify-between items-center mb-4">
      <div>
        <h3 class="text-lg font-bold text-orange-800">⚠️ Pending Review ({{ pendingLogs.length }})</h3>
        <p class="text-sm text-orange-700">These items exceed the daily hours limit and require approval.</p>
      </div>
      <span v-if="actionStatus" class="text-sm font-bold text-green-600 bg-white px-2 py-1 rounded shadow">{{ actionStatus }}</span>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-left bg-white rounded shadow border border-orange-200">
        <thead class="bg-orange-100 text-orange-900 uppercase text-xs">
          <tr>
            <th class="p-3">Member</th>
            <th class="p-3">Date</th>
            <th class="p-3">Activity</th>
            <th class="p-3 text-right">Hours</th>
            <th class="p-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody class="text-sm">
          <tr v-for="log in pendingLogs" :key="log.id" class="border-t hover:bg-orange-50 transition-colors">
            <td class="p-3 font-bold text-gray-800">{{ log.memberName }}</td>
            <td class="p-3">{{ log.date }}</td>
            <td class="p-3">{{ log.activity }}</td>
            <td class="p-3 text-right font-mono font-bold">{{ log.hours }}</td>
            <td class="p-3 flex justify-center gap-2">
              <button 
                @click="handleApprove(log.id)"
                class="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-xs font-bold shadow-sm"
              >
                Approve
              </button>
              <button 
                @click="handleReject(log.id)"
                class="bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 text-xs font-bold border border-red-200"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>