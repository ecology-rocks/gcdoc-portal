<script setup>
import { ref } from 'vue'
import { collection, addDoc } from "firebase/firestore"
import { db } from '@/firebase'

const loading = ref(false)

// --- BASIC EVENT DATA ---
const form = ref({
  title: '',
  description: '',
  location: '',
  start: '',
  end: '',
  needsVolunteers: false
})

// --- VOLUNTEER CONFIGURATION ---
const configMode = ref('recurring') // 'recurring' | 'shifts'

// Scenario A: Recurring Patterns (e.g. "Every Tuesday")
const patterns = ref([
  { day: 'Tuesday', time: '18:00', roles: '', slots: 2 }
])

// Scenario B: Specific Shifts (e.g. "Sat 8am")
const shifts = ref([
  { role: 'Gate Steward', start: '', end: '', slots: 1 }
])

// --- HELPERS ---
const addPattern = () => patterns.value.push({ day: 'Tuesday', time: '18:00', roles: '', slots: 2 })
const removePattern = (idx) => patterns.value.splice(idx, 1)

const addShift = () => shifts.value.push({ role: '', start: '', end: '', slots: 1 })
const removeShift = (idx) => shifts.value.splice(idx, 1)

const resetForm = () => {
  form.value = { title: '', description: '', location: '', start: '', end: '', needsVolunteers: false }
  configMode.value = 'recurring'
  patterns.value = [{ day: 'Tuesday', time: '18:00', roles: '', slots: 2 }]
  shifts.value = [{ role: '', start: '', end: '', slots: 1 }]
}

// --- SUBMIT ---
const handleSubmit = async () => {
  if (!form.value.title || !form.value.start) return alert("Title and Start Date are required.")
  
  loading.value = true
  try {
    const payload = {
      ...form.value,
      start: new Date(form.value.start).toISOString(), // Standardize ISO strings
      end: form.value.end ? new Date(form.value.end).toISOString() : null,
      createdAt: new Date()
    }

    if (form.value.needsVolunteers) {
      payload.volunteerConfig = {
        mode: configMode.value
      }

      if (configMode.value === 'recurring') {
        // Process patterns: split roles string into array
        payload.volunteerConfig.patterns = patterns.value.map(p => ({
          ...p,
          roles: p.roles.split(',').map(r => r.trim()).filter(r => r)
        }))
      } else {
        // Process shifts: generate unique IDs for claiming
        payload.volunteerConfig.shifts = shifts.value.map((s, i) => ({
          ...s,
          id: `shift_${Date.now()}_${i}`, // Simple unique ID generation
          claimedBy: [] 
        }))
      }
    }

    await addDoc(collection(db, "events"), payload)
    alert("Event Created Successfully!")
    resetForm()

  } catch (err) {
    console.error(err)
    alert("Error creating event: " + err.message)
  }
  loading.value = false
}
</script>

<template>
  <div class="p-6 bg-white rounded shadow border-l-4 border-indigo-600">
    <h2 class="text-2xl font-bold text-gray-800 mb-6">Create New Event</h2>

    <form @submit.prevent="handleSubmit" class="space-y-6">
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Event Title</label>
          <input type="text" v-model="form.title" class="w-full p-2 border rounded" placeholder="e.g. October Trial Weekend" required />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Start Time</label>
          <input type="datetime-local" v-model="form.start" class="w-full p-2 border rounded" required />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">End Time (Optional)</label>
          <input type="datetime-local" v-model="form.end" class="w-full p-2 border rounded" />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Location</label>
          <input type="text" v-model="form.location" class="w-full p-2 border rounded" placeholder="e.g. Main Hall" />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
          <input type="text" v-model="form.description" class="w-full p-2 border rounded" placeholder="Short details..." />
        </div>
      </div>

      <div class="bg-gray-50 p-4 rounded border border-gray-200">
        <div class="flex items-center justify-between">
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" v-model="form.needsVolunteers" class="w-5 h-5 text-indigo-600" />
            <span class="font-bold text-gray-700">This event needs volunteers</span>
          </label>
        </div>

        <div v-if="form.needsVolunteers" class="mt-4 pt-4 border-t border-gray-200 animate-fade-in">
          
          <div class="flex gap-4 mb-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="configMode" value="recurring" class="text-indigo-600" />
              <span class="text-sm font-bold">Recurring Pattern</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="configMode" value="shifts" class="text-indigo-600" />
              <span class="text-sm font-bold">Specific Shifts</span>
            </label>
          </div>

          <div v-if="configMode === 'recurring'" class="space-y-3">
            <p class="text-xs text-gray-500 italic">Use this for monthly blocks of practices (e.g. "We need people every Tuesday").</p>
            
            <div v-for="(pat, idx) in patterns" :key="idx" class="flex gap-2 items-end bg-white p-2 border rounded shadow-sm">
              <div>
                <label class="text-[10px] font-bold uppercase text-gray-400">Day</label>
                <select v-model="pat.day" class="p-1 border rounded text-sm w-24">
                  <option>Monday</option><option>Tuesday</option><option>Wednesday</option>
                  <option>Thursday</option><option>Friday</option><option>Saturday</option><option>Sunday</option>
                </select>
              </div>
              <div>
                <label class="text-[10px] font-bold uppercase text-gray-400">Time</label>
                <input type="time" v-model="pat.time" class="p-1 border rounded text-sm" />
              </div>
              <div class="flex-1">
                <label class="text-[10px] font-bold uppercase text-gray-400">Roles (Comma sep)</label>
                <input type="text" v-model="pat.roles" class="w-full p-1 border rounded text-sm" placeholder="Gate, Scribe" />
              </div>
              <div class="w-16">
                <label class="text-[10px] font-bold uppercase text-gray-400">Slots</label>
                <input type="number" v-model="pat.slots" class="w-full p-1 border rounded text-sm" />
              </div>
              <button type="button" @click="removePattern(idx)" class="text-red-500 hover:text-red-700 font-bold px-2">×</button>
            </div>
            <button type="button" @click="addPattern" class="text-xs text-indigo-600 font-bold hover:underline">+ Add Pattern Row</button>
          </div>

          <div v-else class="space-y-3">
            <p class="text-xs text-gray-500 italic">Use this for distinct slots on specific dates (e.g. Trials/Seminars).</p>
            
            <div v-for="(shift, idx) in shifts" :key="idx" class="flex flex-wrap md:flex-nowrap gap-2 items-end bg-white p-2 border rounded shadow-sm">
              <div class="flex-1 min-w-[150px]">
                <label class="text-[10px] font-bold uppercase text-gray-400">Role Name</label>
                <input type="text" v-model="shift.role" class="w-full p-1 border rounded text-sm" placeholder="e.g. Ring Steward" />
              </div>
              <div>
                <label class="text-[10px] font-bold uppercase text-gray-400">Start</label>
                <input type="time" v-model="shift.start" class="p-1 border rounded text-sm" />
              </div>
              <div>
                <label class="text-[10px] font-bold uppercase text-gray-400">End</label>
                <input type="time" v-model="shift.end" class="p-1 border rounded text-sm" />
              </div>
              <div class="w-16">
                <label class="text-[10px] font-bold uppercase text-gray-400">Needed</label>
                <input type="number" v-model="shift.slots" class="w-full p-1 border rounded text-sm" />
              </div>
              <button type="button" @click="removeShift(idx)" class="text-red-500 hover:text-red-700 font-bold px-2">×</button>
            </div>
            <button type="button" @click="addShift" class="text-xs text-indigo-600 font-bold hover:underline">+ Add Shift Row</button>
          </div>

        </div>
      </div>

      <div class="flex justify-end">
        <button 
          type="submit" 
          :disabled="loading"
          class="bg-indigo-600 text-white font-bold py-2 px-6 rounded shadow hover:bg-indigo-700 disabled:opacity-50"
        >
          {{ loading ? 'Creating...' : 'Create Event' }}
        </button>
      </div>

    </form>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-in-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>