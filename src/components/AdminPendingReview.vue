<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, query, where, getDocs, doc, writeBatch, deleteDoc, setDoc, arrayUnion } from "firebase/firestore"
import { db, auth } from '../firebase'
import { calculateRewards } from '../utils'

// --- STATE ---
const pendingGroups = ref({}) 
const applicants = ref([])
const loading = ref(true)
const actionStatus = ref("")

// --- INITIAL LOAD ---
onMounted(async () => {
  loading.value = true
  await Promise.all([
    fetchPendingLogs(),
    fetchApplicants()
  ])
  loading.value = false
})

// --- LOGIC: PENDING LOGS ---
const fetchPendingLogs = async () => {
  pendingGroups.value = {}
  
  try {
    const q = query(collection(db, "logs"), where("status", "==", "pending"))
    const querySnapshot = await getDocs(q)
    
    if (querySnapshot.empty) return

    const rawLogs = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Fetch Member Names for context
    const memberSnap = await getDocs(collection(db, "members"))
    const memberMap = {}
    memberSnap.forEach(doc => {
      const d = doc.data()
      memberMap[doc.id] = `${d.lastName}, ${d.firstName}`
    })

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
}

// --- LOGIC: APPLICANTS ---
const fetchApplicants = async () => {
  try {
    const results = []

    // 1. Fetch REGISTERED Applicants
    const qReg = query(collection(db, "members"), where("membershipType", "==", "Applicant"))
    const snapReg = await getDocs(qReg)
    
    for (const docSnap of snapReg.docs) {
      const userData = docSnap.data()
      const logsQ = query(collection(db, "logs"), where("memberId", "==", docSnap.id))
      const logsSnap = await getDocs(logsQ)
      const logs = logsSnap.docs.map(l => l.data())
      
      results.push({
        id: docSnap.id,
        type: 'registered',
        ...userData,
        stats: calculateRewards(logs, "Applicant")
      })
    }

    // 2. Fetch UNREGISTERED/LEGACY Applicants
    const qLeg = query(collection(db, "legacy_members"), where("membershipType", "==", "Applicant"))
    const snapLeg = await getDocs(qLeg)

    for (const docSnap of snapLeg.docs) {
      const userData = docSnap.data()
      const logsQ = collection(db, "legacy_members", docSnap.id, "legacyLogs")
      const logsSnap = await getDocs(logsQ)
      const logs = logsSnap.docs.map(l => l.data())

      results.push({
        id: docSnap.id,
        type: 'legacy',
        ...userData,
        stats: calculateRewards(logs, "Applicant")
      })
    }
    
    // Sort by hours (highest first)
    results.sort((a, b) => b.stats.totalHours - a.stats.totalHours)
    
    applicants.value = results
  } catch (err) {
    console.error("Error loading applicants:", err)
  }
}

// --- ACTIONS: LOGS ---
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
    await setDoc(doc(db, "archived_logs", log.id), {
      ...log,
      deletedAt: new Date(),
      deletedBy: auth.currentUser.email,
      reason: "rejected_by_admin"
    })
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

// --- ACTION: COPY EMAIL ---
const handleCopyEmail = async (applicant) => {
  if (!applicant.email) {
    alert("Error: No email address on file.")
    return
  }

  try {
    await navigator.clipboard.writeText(applicant.email)
    showStatus(`Copied: ${applicant.email}`)
  } catch (err) {
    console.error("Copy failed", err)
    alert("Could not copy email automatically. Please copy it manually.")
  }
}

// --- HELPERS ---
const removeLogFromLocal = (groupId, logId) => {
  const group = pendingGroups.value[groupId]
  if (!group) return
  group.logs = group.logs.filter(l => l.id !== logId)
  if (group.logs.length === 0) delete pendingGroups.value[groupId]
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
  
  <div v-else-if="sortedGroups.length === 0 && applicants.length === 0" class="p-8 text-gray-500 bg-gray-50 border rounded text-center">
    <div class="text-4xl mb-2">✅</div>
    <p>All caught up!</p>
    <p class="text-xs">No pending logs or applicants to review.</p>
  </div>

  <div v-else class="space-y-8">
    
    <div v-if="applicants.length > 0" class="bg-blue-50 border-l-4 border-blue-500 rounded p-4 shadow-sm">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h3 class="text-lg font-bold text-blue-900">🎓 Applicant Watchlist</h3>
          <p class="text-sm text-blue-800">Review applicants and notify them when eligible.</p>
        </div>
        <span v-if="actionStatus" class="text-xs font-bold text-green-700 bg-white px-3 py-1 rounded shadow animate-pulse border border-green-200">
          {{ actionStatus }}
        </span>
      </div>

      <div class="bg-white rounded border overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="bg-gray-100 uppercase text-xs text-gray-600">
            <tr>
              <th class="p-3">Name</th>
              <th class="p-3">Joined</th>
              <th class="p-3 text-right">Hours</th>
              <th class="p-3">Status</th>
              <th class="p-3 text-center">Contact</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="app in applicants" :key="app.id" class="hover:bg-blue-50">
              <td class="p-3 font-bold">
                {{ app.lastName }}, {{ app.firstName }}
                <div class="text-xs text-gray-400 font-normal">
                  {{ app.email }} 
                  <span v-if="app.type === 'legacy'" class="text-orange-500 font-bold ml-1">(Not Registered)</span>
                </div>
              </td>
              <td class="p-3 text-gray-600">{{ app.joinedDate || "N/A" }}</td>
              <td class="p-3 text-right font-mono">{{ app.stats.totalHours }}</td>
              <td class="p-3">
                <span class="px-2 py-1 rounded-full text-xs font-bold" 
                  :class="app.stats.totalHours >= 10 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'">
                  {{ app.stats.totalHours >= 10 ? 'Ready' : 'In Progress' }}
                </span>
              </td>
              <td class="p-3 text-center">
                <button 
                  @click="handleCopyEmail(app)"
                  class="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1 rounded text-xs font-bold shadow-sm flex items-center gap-1 mx-auto w-max transition-colors active:bg-blue-50"
                  title="Copy email to clipboard"
                >
                  📋 Copy Email
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="sortedGroups.length > 0">
      <div class="flex justify-between items-center bg-orange-100 p-4 rounded border-l-4 border-orange-500 mb-4 shadow-sm">
        <div>
          <h3 class="text-lg font-bold text-orange-900">⚠️ Pending Logs</h3>
          <p class="text-sm text-orange-800">
            {{ sortedGroups.length }} members have items waiting for approval.
          </p>
        </div>
        <span v-if="actionStatus && applicants.length === 0" class="text-sm font-bold text-green-700 bg-white px-3 py-1 rounded shadow animate-pulse">
          {{ actionStatus }}
        </span>
      </div>

      <div class="space-y-6">
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
    </div>
  </div>
</template>