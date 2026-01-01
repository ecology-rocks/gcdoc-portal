<script setup>
import { ref, watch, computed } from 'vue'
import { collection, query, where, getDocs, deleteDoc, doc, getDoc, updateDoc, addDoc } from "firebase/firestore"
import { db, auth } from '../../firebase'
import { getFiscalYear, formatDateStandard, parseDateSafe } from '../../utils'
import NotificationToast from '../popups/NotificationToast.vue'
import ConfirmModal from '../popups/ConfirmModal.vue'

const props = defineProps({
  user: { type: Object, required: true },
  currentUserRole: { type: String, default: 'member' }
})

const emit = defineEmits(['stats-update', 'edit-log'])

const logs = ref([])
const loading = ref(false)
const showSheetModal = ref(false)
const activeSheetUrl = ref('')
const loadingSheet = ref(false)
const toast = ref({ visible: false, message: '', type: 'success' })
const confirmState = ref({ isOpen: false, title: '', message: '', resolve: null })

// --- HELPERS ---
const targetUserId = computed(() => props.user.id || props.user.uid || null)
const isLegacyMember = computed(() => props.user.type === 'legacy')

const showToast = (msg, type = 'success') => {
  toast.value = { visible: true, message: msg, type }
}

const openConfirmModal = (title, message) => {
  return new Promise((resolve) => {
    confirmState.value = { isOpen: true, title, message, resolve }
  })
}

const handleConfirm = () => {
  if (confirmState.value.resolve) confirmState.value.resolve(true)
  confirmState.value.isOpen = false
}

const handleCancel = () => {
  if (confirmState.value.resolve) confirmState.value.resolve(false)
  confirmState.value.isOpen = false
}


const canManageLog = (log) => {
  const role = (props.currentUserRole || '').toLowerCase()
  if (['admin', 'manager'].includes(role)) return true
  if (auth.currentUser && auth.currentUser.uid === log.memberId) return true
  return false
}


// --- FETCH ---
const fetchLogs = async () => {
  if (!targetUserId.value) return
  loading.value = true
  logs.value = []
  
  const currentFY = getFiscalYear(new Date())
  let fyRegularHours = 0
  let fyBlueRibbonHours = 0

  try {
    let snap
    // EXPLICIT CHECK: Are we in Legacy Mode?
    const legacyMode = isLegacyMember.value

    if (legacyMode) {
      snap = await getDocs(collection(db, "legacy_members", targetUserId.value, "legacyLogs"))
    } else {
      const q = query(collection(db, "logs"), where("memberId", "==", targetUserId.value))
      snap = await getDocs(q)
    }
    
    const rawLogs = snap.docs.map(d => {
      const data = d.data()
      const logDate = parseDateSafe(data.date)
      const logFY = getFiscalYear(logDate)
      const hours = parseFloat(data.hours || 0)
      
      const isBlueRibbon = data.isMaintenance === true || ['Maintenance', 'Cleaning'].includes(data.type)
      const countsForCurrentFY = (logFY === currentFY) || (logFY === currentFY - 1 && data.applyToNextYear === true)

      if (data.status === 'approved' && countsForCurrentFY) {
        isBlueRibbon ? (fyBlueRibbonHours += hours) : (fyRegularHours += hours)
      }

      return { 
        id: d.id, 
        ...data,
        sheetId: data.sourceSheetId || data.sheetId || null,
        isBlueRibbon,
        parsedDate: logDate,
        // CRITICAL: Tag the log so the Edit Form knows where it lives
        isLegacy: legacyMode 
      }
    })

    logs.value = rawLogs.sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime())

    const regularVouchers = fyRegularHours >= 50 ? Math.floor(fyRegularHours / 25) : 0
    const blueRibbonVouchers = Math.floor(fyBlueRibbonHours / 8)

    emit('stats-update', {
      year: currentFY,
      regularHours: fyRegularHours,
      regularVouchers,
      blueRibbonHours: fyBlueRibbonHours,
      blueRibbonVouchers
    })

  } catch (err) {
    console.error(err)
    showToast("Error loading logs", "error")
  }
  loading.value = false
}

// --- ACTIONS ---
const archiveAndDeleteLog = async (log) => {
  if (!await openConfirmModal("Delete Entry?", "Cannot be undone.")) return
  try {
    const by = auth.currentUser ? auth.currentUser.email : 'Unknown'
    await addDoc(collection(db, "archived_logs"), { ...log, originalId: log.id, archivedAt: new Date(), archivedBy: by })

    if (log.isLegacy || isLegacyMember.value) {
       await deleteDoc(doc(db, "legacy_members", targetUserId.value, "legacyLogs", log.id))
    } else {
       await deleteDoc(doc(db, "logs", log.id))
    }
    showToast("Deleted.", "success")
    fetchLogs() 
  } catch (err) { showToast(err.message, "error") }
}

const rolloverLog = async (log) => {
  const currentFY = getFiscalYear(parseLogDate(log.date))
  const targetFY = currentFY + 1
  
  // Select Ref based on log tag OR user state
  let docRef
  if (log.isLegacy || isLegacyMember.value) {
    docRef = doc(db, "legacy_members", targetUserId.value, "legacyLogs", log.id)
  } else {
    docRef = doc(db, "logs", log.id)
  }
  
  if (log.applyToNextYear) {
    if (!await openConfirmModal("Remove Rollover?", "Remove from next year?")) return
    try {
      await updateDoc(docRef, { applyToNextYear: false })
      showToast("Rollover removed.", "success")
      fetchLogs()
    } catch(err) { showToast(err.message, "error") }
    return
  }

  if (!await openConfirmModal("Apply Rollover?", `Apply to FY ${targetFY}?`)) return
  try {
    await updateDoc(docRef, { applyToNextYear: true })
    showToast(`Applied to FY ${targetFY}!`, "success")
    fetchLogs()
  } catch (err) { showToast(err.message, "error") }
}

const viewSheet = async (sheetId) => {
  if (!sheetId) return
  loadingSheet.value = true
  activeSheetUrl.value = ''
  showSheetModal.value = true
  try {
    const docSnap = await getDoc(doc(db, "volunteer_sheets", sheetId))
    if (docSnap.exists()) activeSheetUrl.value = docSnap.data().imageUrl
    else { showToast("Sheet not found.", "error"); showSheetModal.value = false }
  } catch (err) { showToast("Error loading sheet.", "error"); showSheetModal.value = false }
  loadingSheet.value = false
}

watch(targetUserId, fetchLogs, { immediate: true })
defineExpose({ fetchLogs })
</script>

<template>
  <div class="bg-white rounded shadow border border-gray-200 overflow-hidden relative">
    <NotificationToast v-if="toast.visible" :message="toast.message" :type="toast.type" @close="toast.visible = false" />
    <ConfirmModal :isOpen="confirmState.isOpen" :title="confirmState.title" :message="confirmState.message" @confirm="handleConfirm" @cancel="handleCancel" />

    <div class="bg-gray-50 p-4 border-b flex justify-between items-center">
      <h3 class="font-bold text-gray-700">📜 Work History</h3>
      <button @click="fetchLogs" class="text-xs text-blue-600 hover:underline">Refresh</button>
    </div>

    <div v-if="loading" class="p-8 text-center text-gray-400">Loading history...</div>
    <div v-else-if="logs.length === 0" class="p-8 text-center text-gray-500 italic">No hours logged yet.</div>

    <div v-else class="max-h-96 overflow-y-auto">
      <table class="w-full text-sm text-left">
        <thead class="bg-gray-100 text-gray-500 uppercase text-xs sticky top-0 z-10">
          <tr>
            <th class="p-3">Date</th>
            <th class="p-3">Activity</th>
            <th class="p-3 text-right">Hours</th>
            <th class="p-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="log in logs" :key="log.id" class="hover:bg-gray-50 group">
            <td class="p-3 whitespace-nowrap text-gray-600 align-top font-mono text-xs">{{ formatDateStandard(log.date) }}</td>
            <td class="p-3 text-gray-800 align-top">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <span class="font-bold text-xs uppercase text-gray-500">{{ log.type }}</span>
                <span v-if="log.sheetId" @click="viewSheet(log.sheetId)" class="text-[10px] uppercase font-bold bg-gray-100 hover:bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded border border-gray-300 cursor-pointer flex items-center gap-1 transition-colors select-none" title="Click to View Original Sheet">📄 Sheet #{{ log.sheetId.slice(-4) }}</span>
                <span v-if="log.isBlueRibbon" class="text-[10px] uppercase font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">🏆 Blue Ribbon</span>
                <span v-if="log.applyToNextYear" class="text-[10px] uppercase font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">↪️ Rolled Over</span>
                <span v-if="log.status === 'pending'" class="text-[10px] uppercase font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded border border-yellow-200">⏳ Pending</span>
              </div>
              <div class="text-sm text-gray-700 leading-snug">
                {{ log.activity || log.description || '(No details)' }}
                <span class="text-[10px] text-gray-400 font-mono ml-2 select-all">(ID: {{ log.id }})</span>
              </div>
            </td>
            <td class="p-3 text-right font-mono font-bold align-top" :class="log.isBlueRibbon ? 'text-blue-600' : 'text-gray-700'">{{ log.hours }}</td>
            <td class="p-3 text-center align-top min-w-[120px]">
              <div v-if="canManageLog(log)" class="flex flex-wrap justify-center gap-2">
                <button v-if="['admin', 'manager'].includes(currentUserRole.toLowerCase())" @click="rolloverLog(log)" class="text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded text-xs font-bold border border-purple-200">↪️</button>
                <button @click="$emit('edit-log', log)" class="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded text-xs font-bold border border-blue-200">Edit</button>
                <button @click="archiveAndDeleteLog(log)" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded text-xs font-bold border border-red-200">×</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showSheetModal" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
       <div class="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <div class="bg-gray-800 p-3 flex justify-between items-center text-white shrink-0">
             <h3 class="font-bold text-sm">Original Sign-In Sheet</h3>
             <button @click="showSheetModal = false" class="hover:text-gray-300 font-bold px-2">Close</button>
          </div>
          <div class="p-0 flex-grow overflow-auto bg-gray-100 flex items-center justify-center relative">
             <div v-if="loadingSheet" class="text-gray-500 animate-pulse font-bold">Loading Image...</div>
             <img v-else-if="activeSheetUrl" :src="activeSheetUrl" class="max-w-full h-auto object-contain shadow-lg" />
          </div>
       </div>
    </div>
  </div>
</template>