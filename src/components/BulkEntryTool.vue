<script setup>
import { ref, watch, onMounted } from 'vue'
import { collection, getDocs, addDoc, writeBatch, doc, query, where, collectionGroup, updateDoc } from "firebase/firestore"
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"
import { db, storage } from '../firebase'

// --- INNER COMPONENT: MEMBER SEARCH INPUT ---
// defined locally for simplicity
import MemberSearchInput from './MemberSearchInput.vue' 
// Note: Since I can't create two files in one block easily, I will assume you create 
// MemberSearchInput.vue separately (code provided below this block), 
// OR I can inline the logic. 
// RECOMMENDATION: Create a separate file. I will provide it below.

const props = defineProps({
  resumeSheet: Object
})

const emit = defineEmits(['clear-resume'])

const step = ref(1)
const loading = ref(false)

// Sheet Data
const file = ref(null)
const previewUrl = ref(null)
const sheetData = ref({ date: '', event: '', sheetId: '' })
const uploadSuccess = ref(false)

// Entry Data
const members = ref([])
const rows = ref([{ memberId: '', hours: '', activity: '' }])

// --- LOAD DATA ON RESUME ---
watch(() => props.resumeSheet, async (newSheet) => {
  if (newSheet) {
    // 1. Load Sheet Info
    sheetData.value = {
      date: newSheet.date,
      event: newSheet.event || '',
      sheetId: newSheet.sheetId,
      imageUrl: newSheet.imageUrl
    }
    previewUrl.value = newSheet.imageUrl

    // 2. Fetch Existing Logs
    loading.value = true
    try {
      const existingRows = []

      // A. Fetch Active Logs
      const qActive = query(collection(db, "logs"), where("sourceSheetId", "==", newSheet.sheetId))
      const snapActive = await getDocs(qActive)
      snapActive.forEach(d => {
        const data = d.data()
        existingRows.push({
          logPath: `logs/${d.id}`,
          memberId: data.memberId,
          hours: data.hours,
          activity: data.activity,
          isExisting: true
        })
      })

      // B. Fetch Legacy Logs
      const qLegacy = query(collectionGroup(db, "legacyLogs"), where("sourceSheetId", "==", newSheet.sheetId))
      const snapLegacy = await getDocs(qLegacy)

      snapLegacy.forEach(d => {
        const data = d.data()
        const parentPath = d.ref.parent.parent
        const legacyMemberId = parentPath ? parentPath.id : ""

        existingRows.push({
          logPath: d.ref.path,
          memberId: legacyMemberId,
          hours: data.hours,
          activity: data.activity,
          isExisting: true
        })
      })

      // C. Set Rows
      if (existingRows.length > 0) {
        rows.value = [...existingRows, { memberId: '', hours: '', activity: newSheet.event || '' }]
      } else {
        rows.value = [{ memberId: '', hours: '', activity: newSheet.event || '' }]
      }

      step.value = 2
    } catch (err) {
      console.error(err)
      alert("Error loading existing entries: " + err.message)
    }
    loading.value = false
  }
}, { immediate: true })

// --- LOAD MEMBER LIST ---
onMounted(async () => {
  loading.value = true
  const allMembers = []
  // 1. Active
  const activeSnap = await getDocs(collection(db, "members"))
  activeSnap.forEach(d => allMembers.push({
    id: d.id,
    name: `${d.data().lastName}, ${d.data().firstName}`,
    type: 'active'
  }))
  // 2. Legacy
  const legacySnap = await getDocs(collection(db, "legacy_members"))
  legacySnap.forEach(d => {
    if (d.data().lastName) {
      allMembers.push({
        id: d.id,
        name: `${d.data().lastName}, ${d.data().firstName} (Legacy)`,
        type: 'legacy'
      })
    }
  })
  allMembers.sort((a, b) => a.name.localeCompare(b.name))
  members.value = allMembers
  loading.value = false
})

const handleFileSelect = (e) => {
  if (e.target.files[0]) {
    file.value = e.target.files[0]
    previewUrl.value = URL.createObjectURL(e.target.files[0])
    const shortId = Math.floor(1000 + Math.random() * 9000)
    sheetData.value.sheetId = `#${shortId}`
  }
}

const resetUpload = () => {
  uploadSuccess.value = false
  file.value = null
  previewUrl.value = null
  const shortId = Math.floor(1000 + Math.random() * 9000)
  sheetData.value = { date: '', event: '', sheetId: `#${shortId}` }
}

const handleStartEntry = async () => {
  if (!file.value || !sheetData.value.date) return alert("Please select a file and date.")
  loading.value = true

  try {
    const sRef = storageRef(storage, `sheets/${sheetData.value.date}_${sheetData.value.sheetId}`)
    await uploadBytes(sRef, file.value)
    const url = await getDownloadURL(sRef)

    await addDoc(collection(db, "volunteer_sheets"), {
      ...sheetData.value,
      imageUrl: url,
      uploadedAt: new Date(),
      status: 'processing'
    })

    sheetData.value.imageUrl = url
    uploadSuccess.value = true
  } catch (err) {
    console.error(err)
    alert("Error uploading sheet: " + err.message)
  }
  loading.value = false
}

const addRow = () => {
  rows.value.push({ memberId: '', hours: '', activity: sheetData.value.event || '' })
}

const removeRow = (index) => {
  rows.value = rows.value.filter((_, i) => i !== index)
}

const handleCancel = () => {
  step.value = 1
  file.value = null
  previewUrl.value = null
  sheetData.value = { date: '', event: '', sheetId: '' }
  rows.value = [{ memberId: '', hours: '', activity: '' }]
  emit('clear-resume')
}

const handleSubmitAll = async () => {
  const validRows = rows.value.filter(r => r.memberId && r.hours)
  if (validRows.length === 0) return

  if (!window.confirm(`Ready to save changes to ${validRows.length} entries?`)) return
  loading.value = true

  const batch = writeBatch(db)
  let updateCount = 0
  let createCount = 0

  validRows.forEach(row => {
    if (row.isExisting && row.logPath) {
      // UPDATE
      const logRef = doc(db, row.logPath)
      batch.update(logRef, {
        date: sheetData.value.date,
        activity: row.activity,
        hours: parseFloat(row.hours)
      })
      updateCount++
    } else {
      // CREATE
      const memberInfo = members.value.find(m => m.id === row.memberId)
      if (!memberInfo) return

      let logRef
      if (memberInfo.type === 'legacy') {
        logRef = doc(collection(db, "legacy_members", row.memberId, "legacyLogs"))
        batch.set(logRef, {
          date: sheetData.value.date,
          activity: row.activity,
          hours: parseFloat(row.hours),
          status: "approved",
          sourceSheetId: sheetData.value.sheetId,
          importedAt: new Date(),
          applyToNextYear: false
        })
      } else {
        logRef = doc(collection(db, "logs"))
        batch.set(logRef, {
          memberId: row.memberId,
          date: sheetData.value.date,
          activity: row.activity,
          hours: parseFloat(row.hours),
          status: "approved",
          submittedAt: new Date(),
          sourceSheetId: sheetData.value.sheetId,
          applyToNextYear: false
        })
      }
      createCount++
    }
  })

  await batch.commit()
  alert(`Success! Created ${createCount} new entries and updated ${updateCount} existing entries.`)
  handleCancel()
  loading.value = false
}
</script>

<template>
  <div class="p-6 bg-white rounded shadow mb-8 border border-gray-200">
    <h2 class="text-xl font-bold mb-4 text-gray-800">
      {{ resumeSheet ? `Resuming Entry for Sheet ${sheetData.sheetId}` : "Bulk Entry Tool (Handwritten Sheets)" }}
    </h2>

    <div v-if="step === 1" class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div class="border-2 border-dashed border-gray-300 rounded p-8 text-center bg-gray-50 flex flex-col items-center justify-center">
        <img v-if="previewUrl" :src="previewUrl" alt="Preview" class="max-h-64 border shadow" />
        <div v-else class="text-gray-400">No image selected</div>

        <input 
          v-if="!uploadSuccess" 
          type="file" 
          @change="handleFileSelect" 
          class="mt-4" 
          accept="image/*" 
          capture="environment" 
        />
      </div>

      <div class="space-y-4">
        <div v-if="uploadSuccess" class="bg-green-50 border border-green-200 rounded p-6 text-center">
          <div class="text-4xl mb-2">✅</div>
          <h3 class="text-xl font-bold text-green-800 mb-2">Sheet Uploaded!</h3>
          <p class="text-green-700 mb-6">
            Reference ID: <span class="font-mono font-black">{{ sheetData.sheetId }}</span>
          </p>

          <div class="space-y-3">
            <button
              @click="step = 2"
              class="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700"
            >
              Continue to Data Entry
            </button>
            <button
              @click="resetUpload"
              class="w-full bg-white text-gray-700 border border-gray-300 py-3 rounded font-bold hover:bg-gray-50"
            >
              Upload Another Sheet
            </button>
          </div>
        </div>
        
        <div v-else>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase">Sheet Date</label>
            <input type="date" class="w-full p-2 border rounded" v-model="sheetData.date" />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase">Default Activity Name</label>
            <input type="text" placeholder="e.g. Agility Trial Set Up" class="w-full p-2 border rounded" v-model="sheetData.event" />
          </div>

          <div v-if="sheetData.sheetId" class="bg-yellow-50 p-4 border border-yellow-200 rounded text-center my-4">
            <p class="text-sm text-yellow-800 font-bold">Write this ID on the paper sheet:</p>
            <p class="text-4xl font-mono font-black text-gray-800 mt-2">{{ sheetData.sheetId }}</p>
          </div>

          <button
            @click="handleStartEntry"
            :disabled="!file || loading"
            class="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            {{ loading ? "Uploading..." : "Upload Sheet" }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="step === 2" class="flex flex-col gap-6">
      <div class="w-full h-[400px] bg-gray-900 rounded flex items-center justify-center overflow-hidden relative group shrink-0">
        <img :src="previewUrl" alt="Sheet" class="w-full h-full object-contain" />
        <div class="absolute bottom-4 right-4 flex gap-2">
          <a :href="previewUrl" target="_blank" class="bg-white px-3 py-1 rounded text-xs font-bold shadow hover:bg-gray-100">
            Open Full Size
          </a>
        </div>
      </div>

      <div class="w-full flex flex-col bg-white border rounded p-4 shadow-sm">
        <h3 class="font-bold text-gray-700 mb-2">Log Entries</h3>
        
        <div class="max-h-[500px] overflow-y-auto border rounded">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th class="p-2">Member</th>
                <th class="p-2 w-24">Hours</th>
                <th class="p-2">Activity</th>
                <th class="p-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in rows" :key="i" class="border-b" :class="{ 'bg-gray-50': row.isExisting }">
                <td class="p-2 relative">
                  <MemberSearchInput
                    :members="members"
                    v-model="row.memberId"
                    :disabled="row.isExisting"
                  />
                </td>
                <td class="p-2">
                  <input type="number" class="w-full p-2 border rounded" v-model="row.hours" />
                </td>
                <td class="p-2">
                  <input type="text" class="w-full p-2 border rounded" v-model="row.activity" />
                </td>
                <td class="p-2 text-center">
                  <button @click="removeRow(i)" class="text-red-500 hover:text-red-700 font-bold text-lg px-2">
                    ×
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <button @click="addRow" class="mt-2 text-blue-600 text-sm font-bold hover:underline self-start">
          + Add Row
        </button>

        <div class="pt-4 border-t mt-4 flex justify-between items-center">
          <button @click="handleCancel" class="text-gray-500 px-4 py-2 hover:bg-gray-100 rounded">
            Cancel
          </button>
          <div class="text-right">
            <p class="text-xs text-gray-400 mb-1 mr-1">
              {{ rows.filter(r => r.memberId && r.hours).length }} valid entries
            </p>
            <button
              @click="handleSubmitAll"
              :disabled="loading"
              class="bg-green-600 text-white px-8 py-3 rounded font-bold hover:bg-green-700 shadow"
            >
              {{ loading ? "Saving..." : "Submit Changes" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>