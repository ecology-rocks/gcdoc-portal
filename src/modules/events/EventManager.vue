<script setup>
import { ref, onMounted } from 'vue'
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore"
import { db } from '@/firebase'
import NotificationToast from '@components/common/NotificationToast.vue' // <--- IMPORT

const loading = ref(false)
const events = ref([])
const isEditing = ref(false)
const editId = ref(null)

// --- NOTIFICATION STATE ---
const toast = ref({
  visible: false,
  message: '',
  type: 'success'
})

const showToast = (msg, type = 'success') => {
  toast.value = { visible: true, message: msg, type }
}

// --- FORM STATE ---
const form = ref({
  title: '',
  description: '',
  location: '',
  start: '',
  end: '',
  needsVolunteers: false
})

const configMode = ref('recurring') 
const patterns = ref([{ day: 'Tuesday', time: '18:00', roles: '', slots: 2 }])
const shifts = ref([{ role: 'Gate', start: '', end: '', slots: 1 }])

// --- FETCHING ---
const fetchEvents = async () => {
  loading.value = true
  events.value = []
  try {
    const q = query(collection(db, "events"), orderBy("start", "desc"))
    const snap = await getDocs(q)
    events.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (err) {
    console.error(err)
    showToast("Failed to load events", "error")
  }
  loading.value = false
}

// --- FORM HELPERS ---
const addPattern = () => patterns.value.push({ day: 'Tuesday', time: '18:00', roles: '', slots: 2 })
const removePattern = (idx) => patterns.value.splice(idx, 1)
const addShift = () => shifts.value.push({ role: '', start: '', end: '', slots: 1 })
const removeShift = (idx) => shifts.value.splice(idx, 1)

const resetForm = () => {
  form.value = { title: '', description: '', location: '', start: '', end: '', needsVolunteers: false }
  configMode.value = 'recurring'
  patterns.value = [{ day: 'Tuesday', time: '18:00', roles: '', slots: 2 }]
  shifts.value = [{ role: '', start: '', end: '', slots: 1 }]
  isEditing.value = false
  editId.value = null
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const loadForEdit = (event) => {
  isEditing.value = true
  editId.value = event.id
  
  form.value = {
    title: event.title,
    description: event.description || '',
    location: event.location || '',
    start: event.start ? event.start.slice(0, 16) : '', 
    end: event.end ? event.end.slice(0, 16) : '',
    needsVolunteers: event.needsVolunteers || false
  }

  if (event.volunteerConfig) {
    configMode.value = event.volunteerConfig.mode || 'recurring'
    
    if (configMode.value === 'recurring' && event.volunteerConfig.patterns) {
      patterns.value = event.volunteerConfig.patterns.map(p => ({
        ...p,
        roles: Array.isArray(p.roles) ? p.roles.join(', ') : p.roles
      }))
    }
    
    if (configMode.value === 'shifts' && event.volunteerConfig.shifts) {
      shifts.value = event.volunteerConfig.shifts
    }
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// --- ACTIONS ---
const handleDelete = async (id) => {
  if (!confirm("Are you sure you want to delete this event? This cannot be undone.")) return
  try {
    await deleteDoc(doc(db, "events", id))
    events.value = events.value.filter(e => e.id !== id)
    showToast("Event deleted successfully", "success")
  } catch (err) {
    showToast("Error deleting: " + err.message, "error")
  }
}

const handleSubmit = async () => {
  if (!form.value.title || !form.value.start) return showToast("Title and Start Date are required.", "error")
  
  loading.value = true
  try {
    const payload = {
      ...form.value,
      start: new Date(form.value.start).toISOString(),
      end: form.value.end ? new Date(form.value.end).toISOString() : null,
      updatedAt: new Date()
    }

    if (form.value.needsVolunteers) {
      payload.volunteerConfig = { mode: configMode.value }

      if (configMode.value === 'recurring') {
        payload.volunteerConfig.patterns = patterns.value.map(p => ({
          ...p,
          roles: p.roles.split(',').map(r => r.trim()).filter(r => r)
        }))
      } else {
        payload.volunteerConfig.shifts = shifts.value.map((s, i) => ({
          ...s,
          id: s.id || `shift_${Date.now()}_${i}`,
          claimedBy: s.claimedBy || [] 
        }))
      }
    } else {
       payload.volunteerConfig = null
    }

    if (isEditing.value) {
      await updateDoc(doc(db, "events", editId.value), payload)
      showToast("Event Updated!", "success")
    } else {
      payload.createdAt = new Date()
      await addDoc(collection(db, "events"), payload)
      showToast("Event Created!", "success")
    }

    resetForm()
    fetchEvents()

  } catch (err) {
    console.error(err)
    showToast("Error saving: " + err.message, "error")
  }
  loading.value = false
}

onMounted(fetchEvents)
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
    
    <NotificationToast 
      v-if="toast.visible"
      :message="toast.message" 
      :type="toast.type" 
      @close="toast.visible = false"
    />

    <div class="lg:col-span-2 bg-white p-6 rounded shadow border-t-4" :class="isEditing ? 'border-orange-500' : 'border-green-600'">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-bold text-gray-800">{{ isEditing ? 'Edit Event' : 'Create Event' }}</h2>
        <button v-if="isEditing" @click="resetForm" class="text-xs text-gray-500 underline">Cancel Edit</button>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Title</label>
          <input type="text" v-model="form.title" class="w-full p-2 border rounded" required />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Start</label>
            <input type="datetime-local" v-model="form.start" class="w-full p-2 border rounded" required />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">End</label>
            <input type="datetime-local" v-model="form.end" class="w-full p-2 border rounded" />
          </div>
        </div>

        <div>
           <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Location</label>
           <input type="text" v-model="form.location" class="w-full p-2 border rounded" />
        </div>

        <div class="bg-gray-50 p-4 rounded border">
          <label class="flex items-center gap-2 cursor-pointer mb-4">
            <input type="checkbox" v-model="form.needsVolunteers" class="w-5 h-5 text-indigo-600" />
            <span class="font-bold text-gray-700">Needs Volunteers?</span>
          </label>

          <div v-if="form.needsVolunteers">
             <div class="flex gap-6 mb-4 border-b pb-2">
                <label class="flex items-center gap-2 text-sm font-bold cursor-pointer">
                  <input type="radio" v-model="configMode" value="recurring" class="text-indigo-600"> 
                  Recurring Pattern
                </label>
                <label class="flex items-center gap-2 text-sm font-bold cursor-pointer">
                  <input type="radio" v-model="configMode" value="shifts" class="text-indigo-600"> 
                  Specific Shifts
                </label>
             </div>

             <div v-if="configMode === 'recurring'" class="space-y-3">
                <div v-for="(p, i) in patterns" :key="i" class="bg-white p-3 border rounded shadow-sm flex flex-wrap gap-3 items-end">
                   <div>
                      <label class="text-[10px] font-bold uppercase text-gray-400 block">Day</label>
                      <select v-model="p.day" class="border rounded p-1 text-sm"><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option><option>Sunday</option></select>
                   </div>
                   <div>
                      <label class="text-[10px] font-bold uppercase text-gray-400 block">Time</label>
                      <input type="time" v-model="p.time" class="border rounded p-1 text-sm" />
                   </div>
                   <div class="flex-grow min-w-[150px]">
                      <label class="text-[10px] font-bold uppercase text-gray-400 block">Roles</label>
                      <input type="text" v-model="p.roles" placeholder="e.g. Gate, Scribe" class="w-full border rounded p-1 text-sm" />
                   </div>
                   <div class="w-16">
                      <label class="text-[10px] font-bold uppercase text-gray-400 block">Slots</label>
                      <input type="number" v-model="p.slots" class="w-full border rounded p-1 text-sm" />
                   </div>
                   <button type="button" @click="removePattern(i)" class="text-red-500 font-bold hover:bg-red-50 p-1 rounded">×</button>
                </div>
                <button type="button" @click="addPattern" class="text-sm text-blue-600 font-bold hover:underline">+ Add Pattern Row</button>
             </div>

             <div v-else class="space-y-3">
                <div v-for="(s, i) in shifts" :key="i" class="bg-white p-3 border rounded shadow-sm flex flex-wrap gap-3 items-end">
                   <div class="flex-grow min-w-[150px]">
                      <label class="text-[10px] font-bold uppercase text-gray-400 block">Role Name</label>
                      <input type="text" v-model="s.role" placeholder="e.g. Ring Steward" class="w-full border rounded p-1 text-sm" />
                   </div>
                   <div>
                      <label class="text-[10px] font-bold uppercase text-gray-400 block">Start</label>
                      <input type="time" v-model="s.start" class="border rounded p-1 text-sm" />
                   </div>
                   <div>
                      <label class="text-[10px] font-bold uppercase text-gray-400 block">End</label>
                      <input type="time" v-model="s.end" class="border rounded p-1 text-sm" />
                   </div>
                   <div class="w-16">
                      <label class="text-[10px] font-bold uppercase text-gray-400 block">Slots</label>
                      <input type="number" v-model="s.slots" class="w-full border rounded p-1 text-sm" />
                   </div>
                   <button type="button" @click="removeShift(i)" class="text-red-500 font-bold hover:bg-red-50 p-1 rounded">×</button>
                </div>
                <button type="button" @click="addShift" class="text-sm text-blue-600 font-bold hover:underline">+ Add Shift Row</button>
             </div>
          </div>
        </div>

        <div class="pt-4">
          <button 
            type="submit" 
            :disabled="loading"
            class="w-full text-white font-bold py-3 rounded shadow transition text-lg"
            :class="isEditing ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'"
          >
            {{ isEditing ? 'Update Event Details' : 'Create New Event' }}
          </button>
        </div>
      </form>
    </div>

    <div class="lg:col-span-1 border-l pl-0 lg:pl-8 border-gray-200">
       <h3 class="text-lg font-bold text-gray-700 mb-4 sticky top-0 bg-gray-100 py-2 z-10">Existing Events</h3>
       <div v-if="events.length === 0" class="text-gray-500 italic">No events found.</div>
       
       <div class="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
          <div v-for="event in events" :key="event.id" class="bg-white p-4 rounded shadow border-l-4 border-indigo-500 group relative">
             <div class="pr-8">
                <h4 class="font-bold text-gray-800 text-sm mb-1">{{ event.title }}</h4>
                <p class="text-xs text-gray-600 mb-2">
                   {{ new Date(event.start).toLocaleDateString() }} 
                   <br>
                   {{ new Date(event.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }}
                </p>
                <div v-if="event.needsVolunteers">
                   <span class="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase border border-indigo-100">
                      {{ event.volunteerConfig?.mode }}
                   </span>
                </div>
             </div>

             <div class="absolute top-2 right-2 flex flex-col gap-2">
                <button @click="loadForEdit(event)" class="text-blue-500 hover:bg-blue-50 p-1 rounded" title="Edit">✏️</button>
                <button @click="handleDelete(event.id)" class="text-red-400 hover:bg-red-50 p-1 rounded" title="Delete">🗑️</button>
             </div>
          </div>
       </div>
    </div>

  </div>
</template>