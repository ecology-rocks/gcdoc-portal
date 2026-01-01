<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, getDocs, writeBatch, doc, query } from "firebase/firestore"
import { db } from '../../firebase'

const loading = ref(true)
const processing = ref(false)
const legacyList = ref([])
const activeList = ref([])

const selectedLegacyId = ref("")
const selectedActiveId = ref("")
const status = ref("")

// --- LOAD LISTS ---
onMounted(async () => {
  loading.value = true
  try {
    // 1. Get Legacy Members (Source)
    const legSnap = await getDocs(collection(db, "legacy_members"))
    legacyList.value = legSnap.docs.map(d => ({
      id: d.id,
      name: `${d.data().lastName}, ${d.data().firstName}`,
      email: d.data().email,
      entryCount: 0 // We don't know count yet without querying subcollections, usually ok to skip for UI speed
    })).sort((a, b) => a.name.localeCompare(b.name))

    // 2. Get Active Members (Target)
    const actSnap = await getDocs(collection(db, "members"))
    activeList.value = actSnap.docs.map(d => ({
      id: d.id,
      name: `${d.data().lastName}, ${d.data().firstName}`,
      email: d.data().email
    })).sort((a, b) => a.name.localeCompare(b.name))

  } catch (err) {
    console.error(err)
    status.value = "Error loading lists: " + err.message
  }
  loading.value = false
})

const handleMerge = async () => {
  if (!selectedLegacyId.value || !selectedActiveId.value) return
  
  const source = legacyList.value.find(l => l.id === selectedLegacyId.value)
  const target = activeList.value.find(a => a.id === selectedActiveId.value)

  const confirmMsg = `MERGE WARNING:\n\nMove all data from legacy profile:\n"${source.name}" (${source.email})\n\nINTO active profile:\n"${target.name}" (${target.email})?\n\nThis cannot be undone.`
  if (!window.confirm(confirmMsg)) return

  processing.value = true
  status.value = "Starting merge..."

  try {
    const batch = writeBatch(db)
    let opCount = 0

    // 1. Fetch all logs from the legacy subcollection
    const logsRef = collection(db, "legacy_members", source.id, "legacyLogs")
    const logsSnap = await getDocs(logsRef)

    status.value = `Moving ${logsSnap.size} log entries...`

    // 2. Move each log
    logsSnap.forEach(oldLog => {
      const newData = oldLog.data()
      // Create ref in the main "logs" collection
      const newLogRef = doc(collection(db, "logs"))
      
      batch.set(newLogRef, {
        ...newData,
        memberId: target.id, // Re-assign ownership
        importedAt: new Date(),
        originalLegacyId: source.id,
        status: "approved" // Legacy data is usually assumed valid
      })

      // Delete old log
      batch.delete(oldLog.ref)
      
      opCount += 2 // 1 create + 1 delete
    })

    // 3. Delete the legacy parent document
    const sourceRef = doc(db, "legacy_members", source.id)
    batch.delete(sourceRef)
    opCount++

    // 4. Commit
    await batch.commit()
    
    status.value = `Success! Moved ${logsSnap.size} entries. "${source.name}" profile deleted.`
    
    // Refresh lists locally
    legacyList.value = legacyList.value.filter(l => l.id !== selectedLegacyId.value)
    selectedLegacyId.value = ""
    selectedActiveId.value = ""

  } catch (err) {
    console.error(err)
    status.value = "Error during merge: " + err.message
  }
  processing.value = false
}

// Simple filters for dropdowns
const legacySearch = ref("")
const activeSearch = ref("")

const filteredLegacy = computed(() => legacyList.value.filter(l => 
  l.name.toLowerCase().includes(legacySearch.value.toLowerCase()) || 
  (l.email && l.email.toLowerCase().includes(legacySearch.value.toLowerCase()))
))

const filteredActive = computed(() => activeList.value.filter(a => 
  a.name.toLowerCase().includes(activeSearch.value.toLowerCase()) || 
  (a.email && a.email.toLowerCase().includes(activeSearch.value.toLowerCase()))
))

</script>

<template>
  <div class="p-4 bg-purple-50 border border-purple-200 rounded">
    <h3 class="font-bold text-purple-900 mb-4">🔗 Link Legacy Data</h3>
    <p class="text-sm text-purple-800 mb-6">
      Use this tool to manually fix "Orphaned" accounts. It will move all volunteer history from an old (unregistered) email address to a current active member.
    </p>

    <div v-if="loading" class="text-gray-500 italic">Loading profiles...</div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
      
      <div class="bg-white p-4 rounded shadow-sm border border-purple-100">
        <label class="block text-xs font-bold text-gray-500 uppercase mb-2">1. Select Legacy Profile (Source)</label>
        
        <input 
          v-model="legacySearch" 
          placeholder="Filter Legacy Users..." 
          class="w-full p-2 border rounded mb-2 text-sm"
        />
        
        <select v-model="selectedLegacyId" class="w-full p-2 border rounded bg-gray-50" size="6">
          <option v-for="l in filteredLegacy" :key="l.id" :value="l.id">
            {{ l.name }} ({{ l.email || 'No Email' }})
          </option>
        </select>
        <p class="text-xs text-gray-400 mt-1">{{ filteredLegacy.length }} matches</p>
      </div>

      <div class="bg-white p-4 rounded shadow-sm border border-green-100">
        <label class="block text-xs font-bold text-gray-500 uppercase mb-2">2. Select Active Member (Destination)</label>
        
        <input 
          v-model="activeSearch" 
          placeholder="Filter Active Users..." 
          class="w-full p-2 border rounded mb-2 text-sm"
        />

        <select v-model="selectedActiveId" class="w-full p-2 border rounded bg-gray-50" size="6">
          <option v-for="a in filteredActive" :key="a.id" :value="a.id">
            {{ a.name }}
          </option>
        </select>
        <p class="text-xs text-gray-400 mt-1">{{ filteredActive.length }} matches</p>
      </div>

    </div>

    <div class="mt-6 flex flex-col items-center">
      <div v-if="selectedLegacyId && selectedActiveId" class="text-center mb-4">
        <p class="text-sm font-bold text-gray-600">Merge Direction:</p>
        <div class="flex items-center gap-2 justify-center text-lg font-bold text-purple-800">
           <span>{{ legacyList.find(l => l.id === selectedLegacyId)?.name }}</span>
           <span>➡️</span>
           <span>{{ activeList.find(a => a.id === selectedActiveId)?.name }}</span>
        </div>
      </div>

      <button 
        @click="handleMerge"
        :disabled="processing || !selectedLegacyId || !selectedActiveId"
        class="bg-purple-600 text-white px-8 py-3 rounded font-bold hover:bg-purple-700 disabled:opacity-50 shadow"
      >
        {{ processing ? "Merging Data..." : "Merge Records" }}
      </button>

      <p v-if="status" class="mt-4 font-mono text-sm bg-white p-2 border rounded text-purple-700">
        {{ status }}
      </p>
    </div>
  </div>
</template>