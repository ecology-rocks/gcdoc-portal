<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, where, getDocs, doc, writeBatch, deleteDoc, setDoc, arrayUnion } from "firebase/firestore"
import { db, auth } from '../firebase'

const pendingGroups = ref({}) 
const loading = ref(true)
const actionStatus = ref("")

const fetchPendingLogs = async () => {
  loading.value = true
  pendingGroups.value = {}
  
  try {
    // 1. Fetch ALL Pending Logs
    const q = query(collection(db, "logs"), where("status", "==", "pending"))
    const querySnapshot = await getDocs(q)
    
    if (querySnapshot.empty) {
      loading.value = false
      return
    }

    const rawLogs = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // 2. Fetch Member Names
    const memberSnap = await getDocs(collection(db, "members"))
    const memberMap = {}
    memberSnap.forEach(doc => {
      const d = doc.data()
      memberMap[doc.id] = `${d.lastName}, ${d.firstName}`
    })

    // 3. Group by Member
    const groups = {}
    rawLogs.forEach(log => {
      const mId = log.memberId
      if (!groups[mId]) {
        groups[mId] = {
          memberId: mId,
          memberName: memberMap[mId] || "Unknown User",
          logs: []
        }
      }
      groups[mId].logs.push(log)
    })

    Object.values(groups).forEach(group => {
      group.logs.sort((a, b) => new Date(a.date) - new Date(b.date))
    })

    pendingGroups.value = groups

  } catch (err) {
    console.error(err)
    actionStatus.value = "Error loading logs."
  }
  loading.value = false
}

onMounted(fetchPendingLogs)

// --- ACTIONS ---

const handleApproveLog = async (log, groupId) => {
  try {
    const batch = writeBatch(db)
    const logRef = doc(db, "logs", log.id)
    
    const historyEntry = {
      changedAt: new Date().toISOString(),
      changedBy: auth.currentUser.email,
      action: "approved_by_admin"
    }

    batch.update(logRef, { 
      status: "approved",
      history: arrayUnion(historyEntry)
    })
    
    await batch.commit()
    removeLogFromLocal(groupId, log.id)
    showStatus("Approved 1 item.")
  } catch (err) {
    alert("Error: " + err.message)
  }
}

const handleRejectLog = async (log, groupId) => {
  if (!window.confirm("Reject and delete this entry permanently?")) return
  try {
    // 1. Archive
    await setDoc(doc(db, "archived_logs", log.id), {
      ...log,
      deletedAt: new Date(),
      deletedBy: auth.currentUser.email,
      reason: "rejected_by_admin"
    })

    // 2. Delete
    await deleteDoc(doc(db, "logs", log.id))
    
    removeLogFromLocal(groupId, log.id)
    showStatus("Rejected item.")
  } catch (err) {
    alert("Error: " + err.message)
  }
}

const handleApproveGroup = async (group) => {
  if (!window.confirm(`Approve all ${group.logs.length} entries for ${group.memberName}?`)) return
  
  try {
    const batch = writeBatch(db)
    const historyEntry = {
      changedAt: new Date().toISOString(),
      changedBy: auth.currentUser.email,
      action: "batch_approved_by_admin"
    }

    group.logs.forEach(log => {
      const logRef = doc(db, "logs", log.id)
      batch.update(logRef, { 
        status: "approved",
        history: arrayUnion(historyEntry)
      })
    })
    await batch.commit()

    delete pendingGroups.value[group.memberId]
    showStatus(`Approved all for ${group.memberName}`)
  } catch (err) {
    alert("Batch error: " + err.message)
  }
}

// --- HELPERS ---

const removeLogFromLocal = (groupId, logId) => {
  const group = pendingGroups.value[groupId]
  if (!group) return

  group.logs = group.logs.filter(l => l.id !== logId)
  if (group.logs.length === 0) {
    delete pendingGroups.value[groupId]
  }
}

const showStatus = (msg) => {
  actionStatus.value = msg
  setTimeout(() => actionStatus.value = "", 2000)
}

const sortedGroups = computed(() => {
  return Object.values(pendingGroups.value).sort((a, b) => 
    a.memberName.localeCompare(b.memberName)
  )
})
</script>

<template>
  <div v-if="loading" class="p-4 text-gray-500 italic">Checking for pending items...</div>
  
  <div v-else-if="sortedGroups.length === 0" class="p-4 text-gray-500 bg-gray-50 border rounded text-center">
    ✅ All caught up! No pending reviews.
  </div>

  <div v-else class="space-y-6">
    <div class="flex justify-between items-center bg-orange-100 p-4 rounded border-l-4 border-orange-500">
      <div>
        <h3 class="text-lg font-bold text-orange-900">⚠️ Pending Review</h3>
        <p class="text-sm text-orange-800">
          {{ sortedGroups.length }} members have items waiting for approval.
        </p>
      </div>
      <span v-if="actionStatus" class="text-sm font-bold text-green-700 bg-white px-3 py-1 rounded shadow animate-pulse">
        {{ actionStatus }}
      </span>
    </div>

    <div v-for="group in sortedGroups" :key="group.memberId" class="bg-white border border-gray-300 rounded shadow-sm overflow-hidden">
      <div class="bg-gray-100 p-3 flex justify-between items-center border-b">
        <h4 class="font-bold text-gray-800 text-lg">
          {{ group.memberName }} 
          <span class="text-sm font-normal text-gray-500 ml-2">({{ group.logs.length }} items)</span>
        </h4>
        <button 
          @click="handleApproveGroup(group)"
          class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded shadow transition-colors"
        >
          Approve All for {{ group.memberName.split(',')[1] }}
        </button>
      </div>

      <table class="w-full text-left text-sm">
        <thead class="bg-gray-50 text-gray-500 uppercase text-xs">
          <tr>
            <th class="p-3 w-32">Date</th>
            <th class="p-3">Activity</th>
            <th class="p-3 text-right w-24">Hours</th>
            <th class="p-3 text-center w-32">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="log in group.logs" :key="log.id" class="hover:bg-orange-50 transition-colors">
            <td class="p-3">{{ log.date }}</td>
            <td class="p-3 font-medium text-gray-700">{{ log.activity }}</td>
            <td class="p-3 text-right font-mono">{{ log.hours }}</td>
            <td class="p-3 flex justify-center gap-2">
              <button 
                @click="handleApproveLog(log, group.memberId)"
                class="text-green-600 hover:bg-green-100 p-1 rounded"
                title="Approve Single"
              >
                ✔
              </button>
              <button 
                @click="handleRejectLog(log, group.memberId)"
                class="text-red-500 hover:bg-red-100 p-1 rounded"
                title="Reject/Delete"
              >
                ✕
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>