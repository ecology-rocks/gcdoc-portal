<script setup>
import { ref, watch, computed } from 'vue'
import { collection, query, where, getDocs, orderBy } from "firebase/firestore"
import { db } from '../../firebase' // moved up 2 levels
import Accordion from '../../components/common/Accordion.vue' // moved up 1 level
import NotificationToast from '../../components/common/NotificationToast.vue' // in popups folder

const loading = ref(false)
const selectedMonth = ref(new Date().toISOString().slice(0, 7)) // "YYYY-MM"
const events = ref([])
const availabilityDocs = ref([])
const membersMap = ref({}) // uid -> "First Last"
const toast = ref({ visible: false, message: '', type: 'success' })

// --- HELPERS ---
const showToast = (msg, type = 'success') => {
  toast.value = { visible: true, message: msg, type }
}

const to12Hour = (timeStr) => {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${m} ${ampm}`
}

const getDatesForPattern = (dayName, monthStr) => {
  if (!monthStr || !dayName) return []
  const [y, m] = monthStr.split('-').map(Number)
  const date = new Date(y, m - 1, 1)
  const days = []
  const targetDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(dayName)
  
  while (date.getMonth() === m - 1) {
    if (date.getDay() === targetDay) {
      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      days.push(`${yyyy}-${mm}-${dd}`)
    }
    date.setDate(date.getDate() + 1)
  }
  return days
}

// --- DATA FETCHING ---
const fetchData = async () => {
  loading.value = true
  events.value = []
  availabilityDocs.value = []
  membersMap.value = {}

  try {
    // 1. Fetch Members (for ID lookup)
    const memSnap = await getDocs(collection(db, "members"))
    memSnap.forEach(doc => {
      const d = doc.data()
      membersMap.value[doc.id] = `${d.firstName} ${d.lastName}`.trim() || 'Unknown Member'
    })

    // 2. Fetch Events (All active)
    const eventQ = query(collection(db, "events"), where("needsVolunteers", "==", true))
    const eventSnap = await getDocs(eventQ)
    events.value = eventSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    // 3. Fetch Availability for this Month
    const [y, m] = selectedMonth.value.split('-')
    const availIdPrefix = `${y}_${m}` // We can't do exact prefix query easily without a specific field, 
    // so we will query by the 'monthStr' field we added in the previous step.
    
    const availQ = query(collection(db, "volunteer_availability"), where("monthStr", "==", selectedMonth.value))
    const availSnap = await getDocs(availQ)
    availabilityDocs.value = availSnap.docs.map(doc => doc.data())

  } catch (err) {
    console.error(err)
    showToast("Error loading roster data", "error")
  }
  loading.value = false
}

// --- ROSTER LOGIC ---

// Get volunteers for a specific recurring date
const getVolunteersForDate = (event, pattern, dateStr) => {
  const patternKey = `${pattern.day}_${pattern.time}`
  const volunteers = []

  availabilityDocs.value.forEach(doc => {
    const hasGeneral = doc.generalAvailability?.[patternKey] === 'yes'
    const isExcluded = doc.specificDates?.includes(dateStr) && hasGeneral === false // Wait, logic check:
    // If hasGeneral is YES, and specificDates includes it? No, specificDates is usually INCLUSION logic in the new toggler?
    // Let's re-read the Toggler logic from the form:
    // "If 'General Yes' was on... remove 'General Yes' and add REMAINING to specificDates"
    // So if General=Yes, they are IN.
    // However, our previous logic handled Exclusion by REMOVING General=Yes.
    // But wait, the "Extra / One-Off" adder ADDS to specificDates.
    
    // LOGIC MATRIX:
    // 1. General == 'yes' -> They are IN (unless we have an exclusion list, but our data model uses "Specific Dates" as an INCLUSION list primarily).
    //    Actually, look at `handlePatternDateToggle`: 
    //    If I uncheck a date, I remove "General Yes" and add *all other* dates to Specific. 
    //    So, a user is IN if:
    //    A) generalAvailability[key] == 'yes' (Implicitly all dates)
    //    B) OR specificDates.includes(dateStr) (Explicitly this date)

    // However, we need to handle the case where General='yes' AND specificDates includes the date? 
    // In our Form logic, we prevented double counting.
    
    // Correct Logic:
    const inGeneral = doc.generalAvailability?.[patternKey] === 'yes'
    const inSpecific = doc.specificDates?.includes(dateStr)

    // Note: If I have General=Yes, I shouldn't be in specificDates for that pattern, 
    // but even if I am, it just means "Yes".
    // The only way to be "Excluded" is to NOT have General=Yes AND NOT have Specific.
    
    if (inGeneral || inSpecific) {
      volunteers.push({
        uid: doc.userId,
        name: doc.userName || membersMap.value[doc.userId] || 'Unknown'
      })
    }
  })

  return volunteers
}

// Get volunteers for a Shift
const getVolunteersForShift = (shift) => {
  return shift.claimedBy.map(uid => ({
    uid,
    name: membersMap.value[uid] || 'Unknown'
  }))
}

watch(selectedMonth, fetchData, { immediate: true })
</script>

<template>
  <div class="relative">
    <NotificationToast 
      v-if="toast.visible"
      :message="toast.message" 
      :type="toast.type" 
      @close="toast.visible = false"
    />

    <div class="flex justify-between items-center mb-6 bg-white p-4 rounded shadow">
      <div>
        <h2 class="text-2xl font-bold text-gray-800">📋 Master Roster</h2>
        <p class="text-sm text-gray-500">View who is working when.</p>
      </div>
      <input 
        type="month" 
        v-model="selectedMonth" 
        class="border-2 border-indigo-100 p-2 rounded font-bold text-indigo-800 cursor-pointer hover:bg-indigo-50"
      />
    </div>

    <div v-if="loading" class="text-center py-12">
      <div class="text-indigo-600 font-bold animate-pulse">Building Rosters...</div>
    </div>

    <div v-else class="space-y-6">
      <div v-if="events.length === 0" class="text-center text-gray-500 py-8">
        No events found for this period.
      </div>

      <div v-for="event in events" :key="event.id">
        
        <Accordion 
          v-if="event.volunteerConfig?.mode === 'recurring'"
          :title="`[Practice] ${event.title}`"
          color="indigo"
          :defaultOpen="false"
        >
          <div class="bg-gray-50 p-4 rounded-b border-t">
            <div class="space-y-6">
              <div v-for="(pattern, pIdx) in event.volunteerConfig.patterns" :key="pIdx">
                <h4 class="font-bold text-indigo-800 border-b border-indigo-200 pb-1 mb-3">
                  {{ pattern.day }}s @ {{ to12Hour(pattern.time) }} 
                  <span class="text-xs font-normal text-gray-500 ml-2">({{ pattern.roles.join(', ') }})</span>
                </h4>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div 
                    v-for="date in getDatesForPattern(pattern.day, selectedMonth)" 
                    :key="date"
                    class="bg-white border rounded shadow-sm p-3"
                  >
                    <div class="flex justify-between items-center mb-2">
                      <span class="font-bold text-gray-700">{{ new Date(date).toLocaleDateString() }}</span>
                      <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                         {{ getVolunteersForDate(event, pattern, date).length }} / {{ pattern.slots }}
                      </span>
                    </div>
                    
                    <ul class="text-sm space-y-1">
                      <li 
                        v-for="vol in getVolunteersForDate(event, pattern, date)" 
                        :key="vol.uid"
                        class="flex items-center gap-2 text-gray-800"
                      >
                        <span class="text-green-500 text-xs">●</span> {{ vol.name }}
                      </li>
                      <li v-if="getVolunteersForDate(event, pattern, date).length === 0" class="text-gray-400 italic text-xs">
                        No signups yet.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Accordion>

        <Accordion 
          v-if="event.volunteerConfig?.mode === 'shifts'"
          :title="`[Event] ${event.title} - ${new Date(event.start).toLocaleDateString()}`"
          color="orange"
          :defaultOpen="false"
        >
          <div class="bg-white p-4 rounded-b border-t overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-orange-50 text-orange-800 uppercase text-xs">
                <tr>
                  <th class="p-2">Role</th>
                  <th class="p-2">Time</th>
                  <th class="p-2">Volunteers</th>
                  <th class="p-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <div v-if="!event.volunteerConfig.shifts || event.volunteerConfig.shifts.length === 0" class="p-4 text-gray-500 italic">
                  No shifts configured.
                </div>
                <tr v-for="(shift, sIdx) in event.volunteerConfig.shifts" :key="sIdx">
                  <td class="p-3 font-bold text-gray-700">{{ shift.role }}</td>
                  <td class="p-3 text-gray-500">{{ to12Hour(shift.start) }} - {{ to12Hour(shift.end) }}</td>
                  <td class="p-3">
                    <div class="flex flex-wrap gap-2">
                      <span 
                        v-for="vol in getVolunteersForShift(shift)" 
                        :key="vol.uid"
                        class="bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100 text-xs font-bold"
                      >
                        {{ vol.name }}
                      </span>
                      <span v-if="shift.claimedBy.length === 0" class="text-gray-400 italic text-xs py-1">Empty</span>
                    </div>
                  </td>
                  <td class="p-3 text-right">
                    <span 
                      class="text-xs font-bold px-2 py-1 rounded"
                      :class="shift.claimedBy.length >= shift.slots ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
                    >
                      {{ shift.claimedBy.length }} / {{ shift.slots }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Accordion>

      </div>
    </div>
  </div>
</template>