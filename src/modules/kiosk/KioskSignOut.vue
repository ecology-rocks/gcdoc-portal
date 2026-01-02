<script setup>
import { ref } from 'vue'
import { collection, addDoc, doc, deleteDoc } from "firebase/firestore"
import { db } from '@/firebase'

const props = defineProps(['session'])
const emit = defineEmits(['success'])

const endTimeMode = ref('now') 
const customEndTime = ref('')

const confirmSignOut = async () => {
  if (!props.session) return

  let finalEnd = new Date()
  if (endTimeMode.value === 'custom' && customEndTime.value) {
    const [hours, mins] = customEndTime.value.split(':')
    finalEnd.setHours(hours, mins, 0, 0)
  }

  const start = new Date(props.session.signInTime)
  if (finalEnd < start) return alert("Error: End time cannot be before Start time.")
  
  const diffMs = finalEnd - start
  let hours = Math.ceil((diffMs / (1000 * 60 * 60)) * 4) / 4 // Round up to nearest 0.25
  
  const isMaint = (props.session.category === 'maint' || props.session.category === 'cleaning')
  let multiplier = isMaint || props.session.category === 'trial' ? 2 : 1
  
  const finalHours = (hours * multiplier).toFixed(2)

  const newLog = {
    date: finalEnd.toISOString().split('T')[0], 
    activity: props.session.activity,
    hours: parseFloat(finalHours),
    status: 'pending', 
    isMaintenance: isMaint,
    source: 'kiosk',
    submittedAt: new Date(),
    startTime: props.session.signInTime,
    endTime: finalEnd.toISOString()
  }

  if (props.session.memberType !== 'legacy') {
    newLog.memberId = props.session.memberId
  }

  try {
    if (props.session.memberType === 'legacy') {
       await addDoc(collection(db, "legacy_members", props.session.realId, "legacyLogs"), newLog)
    } else {
       await addDoc(collection(db, "logs"), newLog)
    }
    await deleteDoc(doc(db, "active_sessions", props.session.id))
    emit('success')
  } catch (err) {
    alert("Error signing out: " + err.message)
  }
}
</script>

<template>
  <div class="max-w-xl mx-auto w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 mt-10">
    <h2 class="text-3xl font-bold text-white mb-2 text-center">Goodbye, {{ session.memberName.split(' ')[0] }}!</h2>
    <p class="text-center text-slate-400 mb-8">Confirming your session details...</p>
    
    <div class="bg-slate-900 p-4 rounded border border-slate-700 mb-6">
        <div class="flex justify-between mb-2">
          <span class="text-slate-400 text-sm uppercase font-bold">Activity</span>
          <span class="font-bold">{{ session.activity }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400 text-sm uppercase font-bold">Started</span>
          <span class="font-mono text-yellow-500">{{ new Date(session.signInTime).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) }}</span>
        </div>
    </div>

    <div class="mb-8">
      <label class="block text-slate-400 text-sm font-bold uppercase mb-2">When did you finish?</label>
      <div class="flex flex-col gap-3">
          <div class="flex gap-4">
            <button @click="endTimeMode = 'now'" class="flex-1 py-3 rounded-lg border-2 font-bold transition-colors" :class="endTimeMode === 'now' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-900 border-slate-600 text-slate-400'">Just Now</button>
            <button @click="endTimeMode = 'custom'" class="flex-1 py-3 rounded-lg border-2 font-bold transition-colors" :class="endTimeMode === 'custom' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-900 border-slate-600 text-slate-400'">Earlier Today</button>
          </div>
          
          <div v-if="endTimeMode === 'custom'" class="bg-slate-700 p-4 rounded-lg flex items-center justify-between">
            <span class="font-bold">Select Time:</span>
            <input type="time" v-model="customEndTime" class="bg-slate-900 text-white border border-slate-500 p-2 rounded text-lg" />
          </div>
      </div>
    </div>

    <button @click="confirmSignOut" :disabled="endTimeMode === 'custom' && !customEndTime" class="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-2xl font-bold py-5 rounded-xl shadow-lg">COMPLETE SIGN OUT</button>
  </div>
</template>