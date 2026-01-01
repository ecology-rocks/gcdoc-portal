<script setup>
import { ref, computed, watch } from 'vue'
import { collection, addDoc, doc, updateDoc, arrayUnion } from "firebase/firestore"
import { db, auth } from '../../firebase'
import { formatDateStandard } from '../../utils'

const props = defineProps({
  user: { type: Object, required: true },
  currentUserRole: { type: String, default: 'member' },
  initialData: { type: Object, default: null } 
})

const emit = defineEmits(['saved', 'close', 'notify'])

const loading = ref(false)

const CATEGORIES = {
  regular: { label: 'Standard / Regular (1x)', multiplier: 1, isMaintenance: false },
  setup: { label: 'Trial Setup / Teardown (2x)', multiplier: 2, isMaintenance: false },
  maint: { label: 'Cleaning / Maintenance (2x + Blue Ribbon)', multiplier: 2, isMaintenance: true }
}

const form = ref({
  date: new Date().toISOString().slice(0, 10),
  rawHours: 1,
  description: '',
  category: 'regular'
})


const populateForm = () => {
  if (props.initialData) {
    const d = props.initialData
    
    // FIX: Force format to YYYY-MM-DD so the input accepts it
    form.value.date = formatDateStandard(d.date)
    
    const isSetup = d.type && d.type.includes('Setup')
    form.value.rawHours = d.clockHours || (d.hours / (d.isMaintenance || isSetup ? 2 : 1))
    form.value.description = d.activity || d.description || ''
    
    if (d.isMaintenance) form.value.category = 'maint'
    else if (isSetup) form.value.category = 'setup'
    else form.value.category = 'regular'
  } else {
    // Reset
    form.value.date = new Date().toISOString().slice(0, 10)
    form.value.rawHours = 1
    form.value.description = ''
    form.value.category = 'regular'
  }
}

watch(() => props.initialData, populateForm, { immediate: true })

const finalCredit = computed(() => {
  const h = parseFloat(form.value.rawHours) || 0
  const rule = CATEGORIES[form.value.category]
  return h * rule.multiplier
})

const handleSubmit = async () => {
  if (form.value.rawHours <= 0) {
    emit('notify', { message: "Hours must be positive", type: "error" })
    return
  }
  if (!form.value.description) {
    emit('notify', { message: "Description required", type: "error" })
    return
  }

  loading.value = true
  const rule = CATEGORIES[form.value.category]
  const currentUserEmail = auth.currentUser ? auth.currentUser.email : 'Unknown User'

  try {
    const logData = {
      date: form.value.date,
      hours: finalCredit.value,
      clockHours: parseFloat(form.value.rawHours),
      activity: form.value.description,
      type: rule.label,
      isMaintenance: rule.isMaintenance,
      status: props.initialData ? (props.initialData.status || 'approved') : 'approved' 
    }

    if (props.initialData) {
      // --- UPDATE MODE ---
      const isLegacyLog = props.initialData.isLegacy === true || props.user.type === 'legacy'
      
      let logRef
      if (isLegacyLog) {
         logRef = doc(db, "legacy_members", props.user.id, "legacyLogs", props.initialData.id)
      } else {
         logRef = doc(db, "logs", props.initialData.id)
      }
      
      await updateDoc(logRef, {
        ...logData,
        updatedAt: new Date(),
        history: arrayUnion({
          action: 'edited',
          by: currentUserEmail,
          at: new Date().toISOString(),
          previousHours: props.initialData.hours,
          newHours: finalCredit.value
        })
      })
      emit('notify', { message: "Entry updated successfully!", type: "success" })

    } else {
      // --- CREATE MODE ---
      const isLegacyUser = props.user.type === 'legacy'
      let colRef
      if (isLegacyUser) {
        colRef = collection(db, "legacy_members", props.user.id, "legacyLogs")
      } else {
        colRef = collection(db, "logs")
      }

      await addDoc(colRef, {
        ...logData,
        memberId: props.user.id || props.user.uid,
        memberName: `${props.user.firstName} ${props.user.lastName}`,
        createdAt: new Date(),
        history: [{
          action: 'created',
          by: currentUserEmail,
          at: new Date().toISOString()
        }]
      })
      emit('notify', { message: "Hours logged successfully!", type: "success" })
    }
    
    emit('saved')
    emit('close')
  } catch (err) {
    console.error(err)
    emit('notify', { message: "Error saving: " + err.message, type: "error" })
  }
  loading.value = false
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center border-b pb-2 mb-4">
       <h3 class="font-bold text-gray-700">
         {{ initialData ? 'Edit Entry' : 'Log New Hours' }}
       </h3>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Date</label>
        <input type="date" v-model="form.date" class="w-full border rounded p-2" />
      </div>
      <div>
        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Clock Hours</label>
        <input type="number" v-model="form.rawHours" step="0.25" class="w-full border rounded p-2" />
        <p class="text-[10px] text-gray-400 mt-1">Enter actual time worked.</p>
      </div>
    </div>

    <div>
      <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Work Category</label>
      <select v-model="form.category" class="w-full border rounded p-2 bg-white">
        <option value="regular">Standard / Event Work (1x)</option>
        <option value="setup">Trial Setup / Teardown (2x)</option>
        <option value="maint">Cleaning / Maintenance (2x + 🏆)</option>
      </select>
    </div>

    <div class="bg-gray-50 p-3 rounded border flex justify-between items-center">
      <span class="text-xs font-bold text-gray-500 uppercase">Total Credit</span>
      <div class="text-right">
        <span class="block font-bold text-lg text-blue-600">{{ finalCredit }} Hrs</span>
        <span v-if="CATEGORIES[form.category].isMaintenance" class="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 rounded">
          + Blue Ribbon Eligible
        </span>
      </div>
    </div>

    <div>
      <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Activity Description</label>
      <textarea 
        v-model="form.description" 
        rows="3" 
        placeholder="What did you work on?" 
        class="w-full border rounded p-2"
      ></textarea>
    </div>

    <div class="flex justify-end gap-3 pt-2">
      <button @click="$emit('close')" type="button" class="text-gray-500 font-bold text-sm">Cancel</button>
      <button 
        @click="handleSubmit" 
        :disabled="loading"
        class="bg-blue-600 text-white font-bold py-2 px-6 rounded shadow hover:bg-blue-700 disabled:opacity-50"
      >
        {{ loading ? 'Saving...' : (initialData ? 'Update Entry' : 'Submit Hours') }}
      </button>
    </div>
  </div>
</template>