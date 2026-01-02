<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { collection, getDocs, query, where, doc, updateDoc, orderBy } from "firebase/firestore"
import { db } from '@/firebase'

const props = defineProps({
  user: Object
})

const loading = ref(true)
const allClasses = ref([]) // Renamed from myClasses to reflect it might hold EVERYTHING
const selectedClass = ref(null)
const emailStatus = ref('')

// --- FILTERS STATE (Copied from CourseCatalog) ---
const showPastClasses = ref(false)
const selectedSessionFilter = ref('')
const selectedLocationFilter = ref('')
const editingNoteIndex = ref(-1)
const tempNote = ref('')

// --- HELPER FUNCTIONS ---

// 1. Generate fixed sessions (Current + Next Year)
const getSessionOptions = () => {
  const options = []
  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear + 1]
  const templates = [
    "Session 1 (Jan/Feb)", "Session 2 (Mar/Apr)", 
    "Session 3 (May/Jun)", "Session 4 (Aug/Sep)", 
    "Session 5 (Oct/Nov)"
  ]
  years.forEach(year => templates.forEach(t => options.push(`${t} ${year}`)))
  return options
}

// 2. Check if session ended
const isSessionEnded = (sessionStr) => {
  if (!sessionStr) return false
  const yearMatch = sessionStr.match(/\d{4}/)
  if (!yearMatch) return false
  const year = parseInt(yearMatch[0])

  let endMonthIndex = -1
  if (sessionStr.includes("Session 1")) endMonthIndex = 1
  else if (sessionStr.includes("Session 2")) endMonthIndex = 3
  else if (sessionStr.includes("Session 3")) endMonthIndex = 5
  else if (sessionStr.includes("Session 4")) endMonthIndex = 8
  else if (sessionStr.includes("Session 5")) endMonthIndex = 10

  if (endMonthIndex === -1) return false
  const sessionEnd = new Date(year, endMonthIndex + 1, 0, 23, 59, 59)
  return new Date() > sessionEnd
}

// --- DATA FETCHING ---

const fetchClasses = async () => {
  loading.value = true
  allClasses.value = []
  selectedClass.value = null
  
  try {
    let q
    const role = (props.user.role || '').toLowerCase()

    // ADMIN/REGISTRAR: Fetch ALL classes
    if (['admin', 'registrar'].includes(role)) {
       // We fetch all and sort client-side to avoid complex index requirements
       q = query(collection(db, "classes"))
    } 
    // INSTRUCTOR: Fetch ONLY my classes
    else {
      q = query(
        collection(db, "classes"), 
        where("instructors", "array-contains", props.user.uid)
      )
    }

    const snap = await getDocs(q)
    
    // Sort logic: Session (descending/newest first) -> Day -> Time
    allClasses.value = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
         if (a.session !== b.session) return a.session.localeCompare(b.session) // Group by session
         return a.day.localeCompare(b.day) // Then by day
      })

  } catch (err) {
    console.error("Error loading classes:", err)
  }
  loading.value = false
}

// --- COMPUTED FILTERS ---

const uniqueSessions = computed(() => {
  const sessions = new Set(allClasses.value.map(c => c.session).filter(Boolean))
  return Array.from(sessions).sort()
})

const uniqueLocations = computed(() => {
  const locs = new Set(allClasses.value.map(c => c.location).filter(Boolean))
  return Array.from(locs).sort()
})

const filteredClasses = computed(() => {
  return allClasses.value.filter(cls => {
    const ended = isSessionEnded(cls.session)
    
    // 1. Filter by Past/Present
    if (!showPastClasses.value && ended) return false

    // 2. Filter by Specific Session Name
    if (selectedSessionFilter.value && cls.session !== selectedSessionFilter.value) return false

    // 3. NEW: Filter by Location
    if (selectedLocationFilter.value && cls.location !== selectedLocationFilter.value) return false
    
    return true
  })
})

// --- ACTIONS ---

const copyClassEmails = async () => {
  if (!selectedClass.value || !selectedClass.value.roster) return
  const emails = selectedClass.value.roster
    .map(r => r.studentEmail)
    .filter(e => e)
    .join(', ')
    
  if (!emails) return alert("No emails found in roster.")
  await navigator.clipboard.writeText(emails)
  emailStatus.value = "Copied!"
  setTimeout(() => emailStatus.value = '', 2000)
}

const startEditNote = (index, currentNote) => {
  editingNoteIndex.value = index
  tempNote.value = currentNote || ''
}

const saveNote = async (index) => {
  if (!selectedClass.value) return
  selectedClass.value.roster[index].instructorNotes = tempNote.value
  
  try {
    await updateDoc(doc(db, "classes", selectedClass.value.id), {
      roster: selectedClass.value.roster
    })
    editingNoteIndex.value = -1
  } catch (err) {
    alert("Error saving note: " + err.message)
  }
}

onMounted(fetchClasses)
</script>

<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-800">Teacher Dashboard</h1>
      
      <span class="text-xs uppercase font-bold tracking-wide px-2 py-1 bg-gray-200 rounded text-gray-600">
        View As: {{ user.role || 'Member' }}
      </span>
    </div>

    <div v-if="loading" class="text-gray-500 animate-pulse">Loading schedule...</div>

    <div v-else class="flex flex-col md:flex-row gap-6">
      
      <div class="w-full md:w-1/3 flex flex-col gap-4">
        
        <div class="bg-gray-50 p-3 rounded border border-gray-200 space-y-3">
           <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Session</label>
            <select v-model="selectedSessionFilter" class="w-full border rounded px-2 py-1 text-sm bg-white">
              <option value="">All Sessions</option>
              <option v-for="s in uniqueSessions" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Location</label>
            <select v-model="selectedLocationFilter" class="w-full border rounded px-2 py-1 text-sm bg-white">
              <option value="">All Locations</option>
              <option v-for="loc in uniqueLocations" :key="loc" :value="loc">{{ loc }}</option>
            </select>
          </div>

          <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none pt-1 border-t border-gray-200">
            <input type="checkbox" v-model="showPastClasses" class="rounded text-blue-600" />
            Show Past Classes
          </label>
        </div>

        <div class="overflow-y-auto max-h-[70vh] space-y-2 pr-1">
          <div v-if="filteredClasses.length === 0" class="text-gray-500 text-sm italic p-2">
            No classes found matching filters.
          </div>

          <div 
            v-for="cls in filteredClasses" 
            :key="cls.id"
            @click="selectedClass = cls"
            class="p-4 rounded border cursor-pointer transition-all relative overflow-hidden"
            :class="[
              selectedClass?.id === cls.id ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-gray-200 hover:bg-gray-50',
              isSessionEnded(cls.session) ? 'opacity-75 grayscale-[0.5]' : ''
            ]"
          >
            <div v-if="isSessionEnded(cls.session)" class="absolute top-0 right-0 bg-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-bl">
              ENDED
            </div>

            <div class="font-bold text-gray-800 pr-6">{{ cls.title }}</div>
            <div class="flex flex-wrap gap-2 text-xs text-gray-500 mt-1">
              <span class="bg-gray-100 px-1.5 py-0.5 rounded">{{ cls.session }}</span>
              <span class="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">{{ cls.day }}</span>
              <span>@ {{ cls.startTime }}</span>
            </div>
            <div class="text-xs font-bold text-blue-600 mt-2">
              {{ cls.roster ? cls.roster.length : 0 }} Students
            </div>
          </div>
        </div>
      </div>

      <div v-if="selectedClass" class="w-full md:w-2/3 bg-white rounded shadow border border-gray-200 p-6 h-fit">
        <div class="flex justify-between items-center mb-4 border-b pb-4">
          <div>
            <h2 class="text-xl font-bold text-gray-800">{{ selectedClass.title }}</h2>
            <p class="text-sm text-gray-500 flex gap-2">
              <span>{{ selectedClass.session }}</span>
              <span>|</span>
              <span>{{ selectedClass.location }}</span>
            </p>
          </div>
          <button 
            @click="copyClassEmails"
            class="text-sm border border-gray-300 px-3 py-1 rounded hover:bg-gray-50 flex items-center gap-2 transition-colors"
            :class="emailStatus ? 'bg-green-50 border-green-200 text-green-700' : ''"
          >
            <span v-if="!emailStatus">📧 Copy Emails</span>
            <span v-else>✅ Copied!</span>
          </button>
        </div>

        <div v-if="!selectedClass.roster || selectedClass.roster.length === 0" class="text-gray-400 italic py-8 text-center bg-gray-50 rounded">
          Roster is empty.
        </div>

        <div v-else class="space-y-4">
          <div v-for="(student, idx) in selectedClass.roster" :key="idx" class="p-3 bg-gray-50 rounded border border-gray-100 hover:shadow-sm transition-shadow">
            <div class="flex justify-between items-start mb-2">
              <div>
                <span class="font-bold text-gray-800">{{ student.studentName }}</span>
                <span class="text-gray-500 text-sm"> & {{ student.dogName }}</span>
              </div>
            </div>

            <div class="text-sm">
              <div v-if="editingNoteIndex === idx" class="mt-2">
                <textarea 
                  v-model="tempNote" 
                  rows="2" 
                  class="w-full p-2 border rounded text-sm focus:border-blue-500 outline-none"
                  placeholder="Add notes about this team..."
                ></textarea>
                <div class="flex justify-end gap-2 mt-2">
                  <button @click="editingNoteIndex = -1" class="text-xs text-gray-500 font-bold hover:text-gray-700">Cancel</button>
                  <button @click="saveNote(idx)" class="text-xs bg-blue-600 text-white px-3 py-1 rounded font-bold hover:bg-blue-700">Save Note</button>
                </div>
              </div>
              
              <div v-else @click="startEditNote(idx, student.instructorNotes)" class="group cursor-pointer">
                <p v-if="student.instructorNotes" class="text-gray-700 bg-yellow-50 p-2 rounded border border-yellow-100 group-hover:bg-yellow-100 transition-colors">
                  📝 {{ student.instructorNotes }}
                </p>
                <p v-else class="text-gray-400 italic text-xs group-hover:text-blue-500 transition-colors">
                  + Add instructor notes...
                </p>
              </div>
            </div>

          </div>
        </div>

      </div>

      <div v-else class="w-full md:w-2/3 flex items-center justify-center text-gray-400 italic border-2 border-dashed border-gray-200 rounded h-64 bg-gray-50">
        Select a class from the list to view the roster.
      </div>

    </div>
  </div>
</template>