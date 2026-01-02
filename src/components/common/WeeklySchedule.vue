<script setup>
import { ref, onMounted, computed } from 'vue'
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from '@/firebase'

// --- CONSTANTS ---
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

// Color mapping for your specific locations
const LOCATIONS = {
  'The Land': { 
    color: 'bg-green-100 border-green-500 text-green-800', 
    label: 'Land',
    border: 'border-green-500', 
    bg: 'bg-green-500'          
  },
  'Northcutt - Front Room': { 
    color: 'bg-blue-100 border-blue-500 text-blue-800', 
    label: 'Front Rm',
    border: 'border-blue-500',
    bg: 'bg-blue-500'
  },
  'Northcutt - Agility Room': { 
    color: 'bg-purple-100 border-purple-500 text-purple-800', 
    label: 'Agility Rm',
    border: 'border-purple-500',
    bg: 'bg-purple-500'
  }
}
// --- STATE ---
const loading = ref(false)
const allClasses = ref([])
const selectedSession = ref('')
const selectedLocations = ref(Object.keys(LOCATIONS))

// --- SESSION LOGIC (Reused) ---
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
const sessionOptions = getSessionOptions()

// Determine current session to select by default
const getCurrentSession = () => {
  // Simple heuristic: default to first non-ended session
  // You can reuse your precise 'isSessionEnded' logic here if you want strictness
  return sessionOptions.find(s => s.includes(new Date().getFullYear().toString())) || sessionOptions[0]
}

// --- DATA FETCHING ---
const fetchSchedule = async () => {
  if (!selectedSession.value) return
  
  loading.value = true
  try {
    // Fetch ALL classes, we will filter by session in memory or query
    // Querying by session is better for performance if you have an index
    const q = query(
      collection(db, "classes"), 
      where("session", "==", selectedSession.value)
    )
    const snap = await getDocs(q)
    
    allClasses.value = snap.docs.map(d => ({ 
      id: d.id, 
      ...d.data(),
      // Normalize location string just in case
      locationKey: d.data().location || 'Unknown'
    }))
  } catch (err) {
    console.error("Error loading schedule:", err)
  }
  loading.value = false
}

// --- COMPUTED GRID ---
const scheduleByDay = computed(() => {
  const grid = {}
  DAYS.forEach(day => grid[day] = [])

allClasses.value.forEach(cls => {
    // NEW: Only add if the location is currently selected
    if (selectedLocations.value.includes(cls.locationKey)) {
      if (grid[cls.day]) {
        grid[cls.day].push(cls)
      }
    }
  })

  // Sort each day by Start Time
  DAYS.forEach(day => {
    grid[day].sort((a, b) => a.startTime.localeCompare(b.startTime))
  })

  return grid
})

// Initialize
onMounted(() => {
  selectedSession.value = getCurrentSession()
  fetchSchedule()
})
</script>

<template>
  <div class="p-4 md:p-8 max-w-7xl mx-auto">
    
    <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-800">Facility Schedule</h1>
        <p class="text-sm text-gray-500">
          Check for open practice times. If a location is listed here, it is 
          <span class="font-bold text-red-500">CLOSED</span> for practice.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <label class="font-bold text-sm text-gray-600">Viewing:</label>
        <select 
          v-model="selectedSession" 
          @change="fetchSchedule"
          class="border-2 border-blue-600 rounded px-3 py-1 font-bold text-gray-800 bg-white"
        >
          <option v-for="s in sessionOptions" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
    </div>

<div class="flex flex-wrap gap-3 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-200 justify-center md:justify-start">
      <div class="text-xs font-bold text-gray-500 uppercase flex items-center mr-2">
        Filter Locations:
      </div>
      
      <label 
        v-for="(config, key) in LOCATIONS" 
        :key="key"
        class="flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-full border transition-all hover:shadow-sm"
        :class="selectedLocations.includes(key) ? 'bg-white border-gray-300 shadow-sm' : 'bg-gray-100 border-transparent opacity-50'"
      >
        <div class="relative flex items-center">
          <input 
            type="checkbox" 
            :value="key" 
            v-model="selectedLocations"
            class="peer appearance-none w-4 h-4 border-2 rounded bg-white checked:bg-transparent transition-colors"
            :class="config.border"
          />
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 peer-checked:opacity-100">
            <div class="w-2.5 h-2.5 rounded-sm" :class="config.bg"></div>
          </div>
        </div>
        <span class="text-xs font-bold uppercase tracking-wide text-gray-700">
          {{ config.label }}
        </span>
      </label>
    </div>

    <div v-if="loading" class="text-center py-12 animate-pulse text-gray-400">
      Loading schedule...
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-5 gap-4">
      
      <div 
        v-for="day in DAYS" 
        :key="day" 
        class="bg-gray-50 rounded-lg border border-gray-200 flex flex-col h-full"
      >
        <div class="bg-gray-200 text-center py-2 font-bold text-gray-700 text-sm uppercase tracking-wider sticky top-0">
          {{ day.substring(0, 3) }}<span class="hidden md:inline">{{ day.substring(3) }}</span>
        </div>

        <div v-if="scheduleByDay[day].length === 0" class="p-4 text-center text-gray-400 text-xs italic flex-1 flex items-center justify-center min-h-[100px]">
          No Classes<br>Open Practice
        </div>

        <div class="p-2 space-y-2 flex-1">
          <div 
            v-for="cls in scheduleByDay[day]" 
            :key="cls.id"
            class="p-2 rounded border-l-4 text-xs shadow-sm bg-white"
            :class="LOCATIONS[cls.locationKey]?.color || 'border-gray-400 bg-gray-50'"
          >
            <div class="flex justify-between font-bold mb-1">
              <span>{{ cls.startTime }}</span>
              <span class="opacity-75">{{ cls.endTime }}</span>
            </div>
            
            <div class="font-bold text-gray-800 text-sm mb-1 leading-tight">
              {{ cls.title }}
            </div>
            
            <div class="uppercase tracking-tighter font-bold opacity-80" style="font-size: 0.65rem;">
              📍 {{ LOCATIONS[cls.locationKey]?.label || cls.location }}
            </div>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>