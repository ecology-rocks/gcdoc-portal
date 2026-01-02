<script setup>
import { ref, watch, onMounted } from 'vue'
import { collection, query, where, getDocs, doc, setDoc, getDoc, updateDoc } from "firebase/firestore"
import { db } from '@/firebase'
import Accordion from '@components/common/Accordion.vue'
import NotificationToast from '@components/common/NotificationToast.vue'
import ConfirmModal from '@components/common/ConfirmModal.vue'

const props = defineProps({
  user: { type: Object, required: true }
})

const loading = ref(false)
const recurringEvents = ref([])
const shiftEvents = ref([]) 
const existingAvailability = ref(null)

// Form Data
const generalAvailability = ref({}) 
const specificDates = ref([]) 
const maxShifts = ref({}) // Keyed by event.id

// --- UI STATE ---
const toast = ref({ visible: false, message: '', type: 'success' })
const confirmState = ref({ isOpen: false, title: '', message: '', resolve: null })

// --- HELPERS ---

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

const to12Hour = (timeStr) => {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${m} ${ampm}`
}

// --- NEW DATE GENERATOR (Uses Event Range, not Calendar Month) ---
const getDaysInRange = (dayName, startStr, endStr) => {
  if (!startStr || !dayName) return []
  
  const start = new Date(startStr)
  // Default to 60 days out if no end date provided, just to be safe
  const end = endStr ? new Date(endStr) : new Date(start.getTime() + (60 * 24 * 60 * 60 * 1000))
  
  const dates = []
  const targetDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(dayName)
  if (targetDay === -1) return []

  // Create a runner date starting at the Event Start
  let current = new Date(start)
  
  // Normalize to midnight to avoid timezone drift issues during iteration
  current.setHours(0,0,0,0)
  
  // If the event start wasn't the target day, we still check it, but the loop handles it.
  // We loop until we pass the End date.
  while (current <= end) {
    if (current.getDay() === targetDay) {
      // Ensure we don't include a date BEFORE the actual start time (rare edge case)
      if (current >= new Date(new Date(startStr).setHours(0,0,0,0))) {
        const yyyy = current.getFullYear()
        const mm = String(current.getMonth() + 1).padStart(2, '0')
        const dd = String(current.getDate()).padStart(2, '0')
        dates.push(`${yyyy}-${mm}-${dd}`)
      }
    }
    current.setDate(current.getDate() + 1)
  }
  return dates
}

const getPatternKey = (event, pattern) => {
  return `${pattern.day}_${pattern.time}` 
}

// --- SHIFT CLAIM LOGIC ---
const handleShiftToggle = async (event, shiftIndex) => {
  const confirmed = await openConfirmModal("Update Shift?", "Are you sure you want to change your signup status for this shift?")
  if (!confirmed) return

  const eventRef = doc(db, "events", event.id)
  const currentShifts = [...event.volunteerConfig.shifts]
  const targetShift = currentShifts[shiftIndex]
  const uid = props.user.uid

  const isClaimed = targetShift.claimedBy.includes(uid)

  if (isClaimed) {
    targetShift.claimedBy = targetShift.claimedBy.filter(id => id !== uid)
  } else {
    if (targetShift.claimedBy.length >= targetShift.slots) {
      return showToast("Sorry, this shift is full!", "error")
    }
    targetShift.claimedBy.push(uid)
  }

  event.volunteerConfig.shifts = currentShifts

  try {
    await updateDoc(eventRef, { "volunteerConfig.shifts": currentShifts })
    showToast("Shift updated successfully!", "success")
  } catch (err) {
    console.error(err)
    showToast("Error updating shift: " + err.message, "error")
  }
}

// --- SMART TOGGLE LOGIC ---
const handlePatternDateToggle = (dateStr, patternKey, allPatternDates) => {
  const isEffectivelySelected = generalAvailability.value[patternKey] === 'yes' || specificDates.value.includes(dateStr)

  if (isEffectivelySelected) {
    if (generalAvailability.value[patternKey] === 'yes') {
      delete generalAvailability.value[patternKey] 
      allPatternDates.forEach(d => {
        if (d !== dateStr && !specificDates.value.includes(d)) {
           specificDates.value.push(d)
        }
      })
    } else {
      specificDates.value = specificDates.value.filter(d => d !== dateStr)
    }
  } else {
    if (!specificDates.value.includes(dateStr)) {
      specificDates.value.push(dateStr)
    }
  }

  const allNowSelected = allPatternDates.every(d => specificDates.value.includes(d))
  if (allNowSelected) {
    generalAvailability.value[patternKey] = 'yes'
    specificDates.value = specificDates.value.filter(d => !allPatternDates.includes(d))
  }
}

const handleGeneralSelect = (patternKey, allPatternDates) => {
  if (generalAvailability.value[patternKey] === 'yes') {
    specificDates.value = specificDates.value.filter(d => !allPatternDates.includes(d))
  }
}

// --- FETCH & SUBMIT ---
const fetchEvents = async () => {
  loading.value = true
  recurringEvents.value = []
  shiftEvents.value = []
  generalAvailability.value = {}
  specificDates.value = []
  maxShifts.value = {}
  
  try {
    const q = query(collection(db, "events"), where("needsVolunteers", "==", true))
    const snap = await getDocs(q)
    
    const rec = []
    const sft = []

    snap.forEach(doc => {
      const data = doc.data()
      // Sort: Recurring events first, Shifts second
      if (data.volunteerConfig?.mode === 'recurring') {
        rec.push({ id: doc.id, ...data })
      } else if (data.volunteerConfig?.mode === 'shifts') {
        sft.push({ id: doc.id, ...data })
      }
    })
    
    recurringEvents.value = rec
    shiftEvents.value = sft

    // Load User's Availability Bucket (We use a generic "global" bucket per user now since we removed month filtering)
    // Actually, to keep it simple with existing data, let's just use "current_bucket" or map to the current month for storage
    // For simplicity given the requirement changes, we will store in a "master" doc for the user
    const availId = `master_${props.user.uid}`
    const availSnap = await getDoc(doc(db, "volunteer_availability", availId))
    
    if (availSnap.exists()) {
      const data = availSnap.data()
      generalAvailability.value = data.generalAvailability || {}
      specificDates.value = data.specificDates || []
      maxShifts.value = data.maxShifts || {}
      existingAvailability.value = data
    } else {
      existingAvailability.value = null
    }

  } catch (err) {
    console.error("Error fetching events:", err)
    showToast("Error loading schedule", "error")
  }
  loading.value = false
}

const handleSubmit = async () => {
  loading.value = true
  const availId = `master_${props.user.uid}`

  try {
    const payload = {
      userId: props.user.uid,
      userName: `${props.user.firstName} ${props.user.lastName}`,
      generalAvailability: generalAvailability.value,
      specificDates: specificDates.value,
      maxShifts: maxShifts.value, 
      updatedAt: new Date()
    }

    await setDoc(doc(db, "volunteer_availability", availId), payload)
    showToast("Availability saved! Thank you.", "success")
    existingAvailability.value = payload
  } catch (err) {
    console.error(err)
    showToast("Error saving: " + err.message, "error")
  }
  loading.value = false
}

onMounted(fetchEvents)
</script>

<template>
  <div class="relative">
    
    <NotificationToast 
      v-if="toast.visible"
      :message="toast.message" 
      :type="toast.type" 
      @close="toast.visible = false"
    />

    <ConfirmModal
      :isOpen="confirmState.isOpen"
      :title="confirmState.title"
      :message="confirmState.message"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />

    <Accordion title="🗓️ Volunteer Signup" color="green" :defaultOpen="true">
      <div v-if="loading" class="text-center py-8 text-gray-500 animate-pulse">
        Loading schedule...
      </div>

      <div v-else>
        
        <div v-if="shiftEvents.length > 0" class="mb-6">
          <h3 class="text-sm font-bold uppercase text-gray-500 mb-3 border-b pb-1">
            1. Trials & Special Events
          </h3>
          
          <div class="space-y-3">
            <Accordion 
              v-for="event in shiftEvents" 
              :key="event.id"
              :title="`${event.title} (${new Date(event.start).toLocaleDateString()})`"
              color="orange"
              :defaultOpen="false" 
            >
              <div class="bg-white p-2 rounded">
                <div v-for="(shift, idx) in event.volunteerConfig.shifts" :key="idx" 
                  class="flex justify-between items-center p-3 border-b last:border-0 hover:bg-gray-50"
                >
                  <div>
                    <div class="font-bold text-gray-800">{{ shift.role }}</div>
                    <div class="text-xs text-gray-500">
                      {{ to12Hour(shift.start) }} - {{ to12Hour(shift.end) }}
                    </div>
                    <div class="text-[10px] font-bold uppercase mt-1" :class="shift.claimedBy.length >= shift.slots ? 'text-red-500' : 'text-green-600'">
                      {{ shift.claimedBy.length }} / {{ shift.slots }} Filled
                    </div>
                  </div>

                  <button 
                    @click="handleShiftToggle(event, idx)"
                    class="px-4 py-2 rounded text-xs font-bold border transition-colors shadow-sm"
                    :class="{
                      'bg-red-50 border-red-200 text-red-600 hover:bg-red-100': shift.claimedBy.includes(user.uid),
                      'bg-green-50 border-green-200 text-green-600 hover:bg-green-100': !shift.claimedBy.includes(user.uid) && shift.claimedBy.length < shift.slots,
                      'bg-gray-100 text-gray-400 cursor-not-allowed': !shift.claimedBy.includes(user.uid) && shift.claimedBy.length >= shift.slots
                    }"
                    :disabled="!shift.claimedBy.includes(user.uid) && shift.claimedBy.length >= shift.slots"
                  >
                    {{ shift.claimedBy.includes(user.uid) ? '❌ Leave Shift' : (shift.claimedBy.length >= shift.slots ? 'Full' : '✅ Sign Up') }}
                  </button>
                </div>
              </div>
            </Accordion>
          </div>
        </div>

        <form @submit.prevent="handleSubmit">
          
          <div class="mb-6" v-if="recurringEvents.length > 0">
            <h3 class="text-sm font-bold uppercase text-gray-500 mb-3 border-b pb-1">
              2. Class & Practice Availability
            </h3>
            
            <div class="space-y-3">
              <Accordion 
                v-for="event in recurringEvents" 
                :key="event.id"
                :title="event.title"
                color="indigo"
                :defaultOpen="false"
              >
                <div class="bg-indigo-50 border-b border-indigo-100 p-3 flex justify-between items-center mb-2">
                  <span class="text-sm text-indigo-900 font-bold">
                    Max Shifts for {{ event.title }}?
                  </span>
                  <input 
                    type="number" 
                    v-model="maxShifts[event.id]" 
                    placeholder="No Limit" 
                    class="w-24 border border-indigo-200 rounded text-center text-sm p-1 font-bold text-indigo-900"
                    min="1"
                  />
                </div>

                <div class="grid gap-3 pt-2">
                  <div 
                    v-for="(pattern, idx) in event.volunteerConfig.patterns" 
                    :key="idx"
                    class="bg-white p-3 rounded shadow-sm border border-gray-100"
                  >
                    <div class="flex flex-col gap-2">
                      <div class="flex items-start justify-between">
                        <div class="text-sm">
                          <span class="font-bold block text-gray-800">{{ pattern.day }}s @ {{ to12Hour(pattern.time) }}</span>
                          <span class="text-xs text-gray-500">Needs: {{ pattern.roles.join(', ') }}</span>
                        </div>

                        <div class="flex gap-2">
                          <label class="flex items-center gap-1 cursor-pointer px-3 py-1 rounded bg-gray-100 hover:bg-green-50 transition-colors">
                            <input 
                              type="radio" 
                              :name="getPatternKey(event, pattern)" 
                              value="yes"
                              v-model="generalAvailability[getPatternKey(event, pattern)]"
                              @change="handleGeneralSelect(getPatternKey(event, pattern), getDaysInRange(pattern.day, event.start, event.end))"
                              class="text-green-600"
                            />
                            <span class="text-xs font-bold text-green-700">Yes</span>
                          </label>
                          <label class="flex items-center gap-1 cursor-pointer px-3 py-1 rounded hover:bg-gray-100 transition-colors">
                            <input 
                              type="radio" 
                              :name="getPatternKey(event, pattern)" 
                              value="no"
                              v-model="generalAvailability[getPatternKey(event, pattern)]"
                              class="text-gray-400"
                            />
                            <span class="text-xs text-gray-500">No</span>
                          </label>
                        </div>
                      </div>

                      <div 
                        v-if="generalAvailability[getPatternKey(event, pattern)] === 'yes' || specificDates.some(d => getDaysInRange(pattern.day, event.start, event.end).includes(d))" 
                        class="mt-2 pl-3 border-l-2 border-green-200"
                      >
                        <p class="text-[10px] uppercase font-bold text-gray-400 mb-1">Confirm Specific Dates:</p>
                        <div class="flex flex-wrap gap-2">
                          <label 
                            v-for="date in getDaysInRange(pattern.day, event.start, event.end)" 
                            :key="date"
                            class="flex items-center gap-1 text-xs bg-gray-50 px-2 py-1 rounded border cursor-pointer select-none"
                            :class="{ 'bg-green-100 border-green-300 text-green-800': generalAvailability[getPatternKey(event, pattern)] === 'yes' || specificDates.includes(date) }"
                          >
                             <input 
                               type="checkbox" 
                               :checked="generalAvailability[getPatternKey(event, pattern)] === 'yes' || specificDates.includes(date)"
                               @change="handlePatternDateToggle(date, getPatternKey(event, pattern), getDaysInRange(pattern.day, event.start, event.end))"
                               class="rounded text-green-600 focus:ring-green-500 w-3 h-3"
                             />
                             <span class="font-mono">{{ date.slice(5) }}</span>
                          </label>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              </Accordion>
            </div>
          </div>

          <div class="text-right">
             <button 
               type="submit" 
               :disabled="loading"
               class="bg-green-600 text-white font-bold py-3 px-8 rounded shadow hover:bg-green-700 transition"
             >
               {{ existingAvailability ? 'Update Availability' : 'Submit Availability' }}
             </button>
          </div>

        </form>
      </div>
    </Accordion>
  </div>
</template>