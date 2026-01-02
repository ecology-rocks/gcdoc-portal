<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"
import { collection, addDoc, serverTimestamp, getDocs, updateDoc, deleteDoc, doc, query, where, collectionGroup } from "firebase/firestore"
import { db, storage } from '@/firebase'

const props = defineProps({
  resumeSheet: Object,
  currentUser: { type: Object, required: true }
})

const emit = defineEmits(['clear-resume'])

// --- UPLOAD STATE ---
const file = ref(null)
const uploading = ref(false)
const sheetName = ref('')

// --- ENTRY STATE ---
const members = ref([])
const loadingMembers = ref(false)
const memberSearch = ref('')
const selectedMemberId = ref('')

const entryDate = ref('')
const entryHours = ref('')
const entryActivity = ref('')
const entryCategory = ref('standard')
const sheetLogs = ref([]) 

// --- CONFIGURATION ---
const CATEGORIES = {
  standard: { label: 'Standard Volunteer', multiplier: 1, isMaintenance: false },
  trial:    { label: 'Trial Set Up / Tear Down', multiplier: 2, isMaintenance: false },
  maint:    { label: 'General Maintenance', multiplier: 2, isMaintenance: true },
  cleaning: { label: 'Cleaning', multiplier: 2, isMaintenance: true }
}

// --- INIT ---
onMounted(() => {
  fetchMembers()
  if (props.resumeSheet) {
    entryDate.value = new Date().toISOString().split('T')[0]
    fetchSheetEntries() 
  }
})

watch(() => props.resumeSheet, (newVal) => {
  if (newVal) {
    entryDate.value = new Date().toISOString().split('T')[0]
    fetchSheetEntries()
  }
})

// --- 1. FETCH LOGS ---
const fetchSheetEntries = async () => {
  if (!props.resumeSheet) return
  
  sheetLogs.value = []
  
  const targetId = props.resumeSheet.sheetId || props.resumeSheet.id
  
  try {
    const results = []

    // QUERY A: Main Logs
    const qMain = query(collection(db, "logs"), where("sourceSheetId", "==", targetId))
    const snapMain = await getDocs(qMain)
    snapMain.forEach(d => {
      results.push({ ...d.data(), id: d.id, collection: 'logs' })
    })

    // QUERY B: Legacy Logs
    const qLegacy = query(collectionGroup(db, "legacyLogs"), where("sourceSheetId", "==", targetId))
    const snapLegacy = await getDocs(qLegacy)
    snapLegacy.forEach(d => {
      // Get parent ID for path reconstruction
      const parentMemberId = d.ref.parent.parent ? d.ref.parent.parent.id : 'Unknown'
      results.push({ 
        ...d.data(), 
        id: d.id, 
        collection: 'legacyLogs',
        memberId: parentMemberId
      })
    })

    sheetLogs.value = results.sort((a,b) => {
      const dateA = a.submittedAt?.seconds || 0
      const dateB = b.submittedAt?.seconds || 0
      return dateB - dateA
    })

  } catch (err) {
    console.error("Error fetching sheet logs:", err)
  }
}

// --- 2. UPLOAD LOGIC ---
const handleFileSelect = (event) => {
  file.value = event.target.files[0]
  if (!sheetName.value && file.value) {
    sheetName.value = `Sheet - ${new Date().toLocaleDateString()}`
  }
}

const handleUpload = async () => {
  if (!file.value || !sheetName.value) return
  uploading.value = true

  try {
    const sRef = storageRef(storage, `sheets/${Date.now()}_${file.value.name}`)
    await uploadBytes(sRef, file.value)
    const url = await getDownloadURL(sRef)

    const uploaderName = `${props.currentUser.firstName} ${props.currentUser.lastName}`

    await addDoc(collection(db, "volunteer_sheets"), {
      event: sheetName.value,          
      imageUrl: url,
      uploadedAt: serverTimestamp(),
      uploadedBy: props.currentUser.email,
      uploadedByName: uploaderName,    
      status: 'pending',
      sheetId: Date.now().toString()
    })

    alert("Upload Complete!")
    file.value = null
    sheetName.value = ''
  } catch (err) {
    console.error(err)
    alert("Upload failed: " + err.message)
  }
  uploading.value = false
}

// --- 3. DATA ENTRY LOGIC ---

const fetchMembers = async () => {
  loadingMembers.value = true
  try {
    const combined = []
    const memSnap = await getDocs(collection(db, "members"))
    memSnap.forEach(d => combined.push({ id: d.id, ...d.data(), type: 'registered' }))
    const legSnap = await getDocs(collection(db, "legacy_members"))
    legSnap.forEach(d => combined.push({ id: d.id, ...d.data(), type: 'legacy', realId: d.id }))

    combined.sort((a,b) => (a.lastName || "").localeCompare(b.lastName || ""))
    members.value = combined
  } catch (e) {
    console.error("Error loading members", e)
  }
  loadingMembers.value = false
}

const filteredMembers = computed(() => {
  if (!memberSearch.value) return members.value
  const s = memberSearch.value.toLowerCase()
  return members.value.filter(m => 
    m.lastName.toLowerCase().includes(s) || 
    m.firstName.toLowerCase().includes(s) ||
    (m.email && m.email.toLowerCase().includes(s))
  )
})

const calculatedCredit = computed(() => {
  const h = parseFloat(entryHours.value) || 0
  const rule = CATEGORIES[entryCategory.value]
  return h * rule.multiplier
})

const getMemberName = (id) => {
  if (!id) return "Unknown Member (ID Missing)"
  const m = members.value.find(mem => mem.id === id)
  if (m) return `${m.lastName}, ${m.firstName}`
  return `Unknown Member (${id})`
}

const handleAddLog = async () => {
  if (!selectedMemberId.value || !entryDate.value || !entryHours.value || !entryActivity.value) {
    alert("Please fill in all fields.")
    return
  }

  const member = members.value.find(m => m.id === selectedMemberId.value)
  if (!member) return

  const rule = CATEGORIES[entryCategory.value]
  const finalHours = calculatedCredit.value
  const sheetLinkID = props.resumeSheet.sheetId || props.resumeSheet.id

  const newLog = {
    date: entryDate.value,
    hours: finalHours,
    activity: entryActivity.value,
    status: 'approved', 
    isMaintenance: rule.isMaintenance,
    sourceSheetId: sheetLinkID, 
    memberId: member.id, 
    submittedAt: new Date(),
    history: [{
      action: 'bulk_entry',
      by: props.currentUser.email,
      at: new Date().toISOString()
    }]
  }

  try {
    let docRef
    if (member.type === 'legacy') {
      docRef = await addDoc(collection(db, "legacy_members", member.realId, "legacyLogs"), newLog)
    } else {
      docRef = await addDoc(collection(db, "logs"), newLog)
    }

    sheetLogs.value.unshift({
      ...newLog,
      id: docRef.id,
      collection: member.type === 'legacy' ? 'legacyLogs' : 'logs',
      memberId: member.id // Ensure local view has ID for name lookup
    })

    entryHours.value = ''
    selectedMemberId.value = ''
    memberSearch.value = ''
    document.getElementById('memberSearchBox')?.focus()

  } catch (err) {
    console.error(err)
    alert("Error saving log: " + err.message)
  }
}

// --- NEW DELETE FUNCTION ---
const handleDeleteLog = async (log) => {
  if (!confirm("Delete this entry?")) return

  try {
    if (log.collection === 'legacyLogs') {
       // Must delete from the specific subcollection
       if (!log.memberId) throw new Error("Missing parent member ID for legacy log")
       await deleteDoc(doc(db, "legacy_members", log.memberId, "legacyLogs", log.id))
    } else {
       // Standard log
       await deleteDoc(doc(db, "logs", log.id))
    }
    
    // Remove from UI
    sheetLogs.value = sheetLogs.value.filter(l => l.id !== log.id)
    
  } catch (err) {
    console.error(err)
    alert("Delete failed: " + err.message)
  }
}

const markSheetDone = async () => {
  if (!confirm("Are you finished entering all names from this sheet?")) return
  try {
    await updateDoc(doc(db, "volunteer_sheets", props.resumeSheet.id), {
      status: 'completed' 
    })
    alert("Sheet marked as complete!")
    emit('clear-resume')
  } catch (err) {
    alert("Error updating sheet: " + err.message)
  }
}
</script>

<template>
  <div class="bg-white rounded shadow border border-gray-200 overflow-hidden">
    
    <div v-if="!resumeSheet" class="p-6">
      <h3 class="font-bold text-gray-700 mb-4">Upload New Sign-In Sheet</h3>
      <div class="flex flex-col gap-4 max-w-lg">
        <div>
           <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Event / Sheet Name</label>
           <input v-model="sheetName" placeholder="e.g. October Meeting..." class="w-full p-2 border rounded" />
        </div>
        <div class="border-2 border-dashed border-gray-300 rounded p-6 text-center hover:bg-gray-50 transition cursor-pointer relative">
          <input type="file" @change="handleFileSelect" accept="image/*" class="absolute inset-0 opacity-0 cursor-pointer" />
          <p v-if="file" class="font-bold text-green-600">{{ file.name }}</p>
          <p v-else class="text-gray-500">Click to select photo or drag & drop</p>
        </div>
        <button 
          @click="handleUpload" 
          :disabled="!file || uploading || !sheetName"
          class="bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {{ uploading ? "Uploading..." : "Upload & Begin Entry" }}
        </button>
      </div>
    </div>

    <div v-else class="flex flex-col h-[80vh]">
      
      <div class="bg-blue-50 p-3 border-b border-blue-200 flex justify-between items-center">
        <div>
          <h3 class="font-bold text-blue-900 text-sm">Working on: {{ resumeSheet.displayTitle || resumeSheet.event }}</h3>
          <p class="text-xs text-blue-700">
            Uploaded by {{ resumeSheet.uploadedByName || resumeSheet.uploadedBy }} | ID: {{ resumeSheet.sheetId }}
          </p>
        </div>
        <div class="flex gap-2">
          <button @click="markSheetDone" class="bg-green-600 text-white text-xs px-3 py-1 rounded font-bold hover:bg-green-700">
            ✔ Finish Sheet
          </button>
          <button @click="$emit('clear-resume')" class="bg-white text-blue-600 border border-blue-300 text-xs px-3 py-1 rounded font-bold hover:bg-blue-50">
            Exit
          </button>
        </div>
      </div>

      <div class="flex flex-1 overflow-hidden">
        
        <div class="w-1/2 bg-gray-900 p-4 flex items-center justify-center overflow-auto relative">
          <img :src="resumeSheet.imageUrl" class="max-w-none shadow-lg border border-gray-700" style="min-width: 100%;" />
        </div>

        <div class="w-1/2 flex flex-col border-l border-gray-200 bg-gray-50">
          
          <div class="p-4 bg-white shadow-sm z-10 border-b">
            <h4 class="font-bold text-gray-700 text-sm mb-3 uppercase tracking-wide">Add Entry</h4>
            
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Member Search</label>
                <div class="relative">
                   <input 
                     id="memberSearchBox"
                     v-model="memberSearch" 
                     placeholder="Type name..." 
                     class="w-full p-2 border rounded border-blue-300 focus:ring-2 focus:ring-blue-200 outline-none" 
                   />
                   <select 
                     v-model="selectedMemberId" 
                     class="w-full mt-1 p-2 border rounded bg-white text-sm" 
                     size="5"
                   >
                     <option v-for="m in filteredMembers" :key="m.id" :value="m.id">
                       {{ m.lastName }}, {{ m.firstName }} ({{ m.type }})
                     </option>
                   </select>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                   <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Date</label>
                   <input type="date" v-model="entryDate" class="w-full p-2 border rounded" />
                </div>
                <div>
                   <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label>
                   <select v-model="entryCategory" class="w-full p-2 border rounded bg-white text-sm">
                      <option value="standard">Standard (1x)</option>
                      <option value="trial">Trial Setup (2x)</option>
                      <option value="maint">Maintenance (2x + 🏆)</option>
                      <option value="cleaning">Cleaning (2x + 🏆)</option>
                   </select>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <div class="col-span-2">
                   <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Activity</label>
                   <input v-model="entryActivity" placeholder="e.g. Attended Meeting" class="w-full p-2 border rounded" />
                </div>
                <div>
                   <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Clock Hrs</label>
                   <input type="number" step="0.25" v-model="entryHours" class="w-full p-2 border rounded" />
                </div>
              </div>

              <div class="flex justify-between items-center pt-2">
                 <div class="text-xs text-gray-500">
                    Credit: <strong>{{ calculatedCredit }} hrs</strong>
                    <span v-if="CATEGORIES[entryCategory].isMaintenance" class="text-green-600 font-bold ml-1">+ Blue Ribbon</span>
                 </div>
                 <button 
                   @click="handleAddLog"
                   class="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 shadow"
                 >
                   Add Row
                 </button>
              </div>

            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-4 bg-gray-50">
            <h4 class="font-bold text-gray-500 text-xs uppercase mb-2">Entries on this Sheet ({{ sheetLogs.length }})</h4>
            
            <div v-if="sheetLogs.length === 0" class="text-sm text-gray-400 italic text-center mt-10">
              No entries found for this sheet ID.
            </div>

            <div v-else class="space-y-2">
              <div v-for="(log, i) in sheetLogs" :key="i" class="bg-white p-3 rounded border border-gray-200 text-sm shadow-sm flex justify-between items-center">
                 <div>
                   <div class="font-bold text-gray-800">{{ getMemberName(log.memberId) }}</div>
                   <div class="text-xs text-gray-500">{{ log.activity }}</div>
                 </div>
                 <div class="text-right">
                   <div class="font-mono text-black font-bold">{{ log.hours }}h</div>
                   <div v-if="log.isMaintenance" class="text-[10px] text-green-600 font-bold uppercase">Blue Ribbon</div>
                   
                   <button 
                     @click="handleDeleteLog(log)" 
                     class="text-xs text-red-400 hover:text-red-700 hover:underline mt-1 block w-full text-right"
                   >
                     Delete
                   </button>
                 </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

  </div>
</template>