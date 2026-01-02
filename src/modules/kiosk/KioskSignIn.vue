<script setup>
import { ref, computed, onMounted } from 'vue' 
import { collection, addDoc } from "firebase/firestore"
import { db } from '@/firebase'

const props = defineProps(['members', 'initialMember']) 
const emit = defineEmits(['register', 'success'])

const searchQuery = ref('')
const selectedMember = ref(null)
const activity = ref('')
const category = ref('standard')
const startTimeMode = ref('now') 
const customStartTime = ref('')

onMounted(() => {
  if (props.initialMember) {
    selectedMember.value = props.initialMember
  }
})

const filteredMembers = computed(() => {
  if (!searchQuery.value || searchQuery.value.length < 2) return []
  const q = searchQuery.value.toLowerCase()
  return props.members.filter(m => 
    (m.lastName.toLowerCase().includes(q)) || 
    (m.firstName.toLowerCase().includes(q))
  ).slice(0, 6)
})

const selectMember = (m) => {
  selectedMember.value = m
  searchQuery.value = '' 
}

const handleClockIn = async () => {
  if (!selectedMember.value || !activity.value) return
  
  let finalStart = new Date()
  if (startTimeMode.value === 'custom' && customStartTime.value) {
     const [hours, mins] = customStartTime.value.split(':')
     finalStart.setHours(hours, mins, 0, 0)
  }
  
  try {
    await addDoc(collection(db, "active_sessions"), {
      memberId: selectedMember.value.id,
      memberName: `${selectedMember.value.firstName} ${selectedMember.value.lastName}`,
      memberType: selectedMember.value.type,
      realId: selectedMember.value.realId || selectedMember.value.id, 
      signInTime: finalStart.toISOString(),
      activity: activity.value,
      category: category.value
    })
    emit('success')
  } catch (err) {
    alert("Error signing in: " + err.message)
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
    
    <div v-if="!selectedMember">
      <h2 class="text-3xl font-bold text-white mb-6 text-center">What is your last name?</h2>
      <input 
        v-model="searchQuery"
        placeholder="Start typing..." 
        class="w-full text-center text-4xl p-6 rounded-xl bg-slate-900 border-2 border-slate-600 text-white focus:border-blue-500 outline-none placeholder-slate-600 uppercase"
        autofocus
      />
      
      <div v-if="searchQuery.length > 1" class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        <button 
          v-for="m in filteredMembers" 
          :key="m.id"
          @click="selectMember(m)"
          class="bg-blue-600 hover:bg-blue-500 p-6 rounded-xl text-left transition-transform active:scale-95 flex items-center"
        >
          <div class="text-2xl font-bold">{{ m.lastName }}, {{ m.firstName }}</div>
        </button>
      </div>

      <div class="mt-8 pt-8 border-t border-slate-700 text-center">
          <p class="text-slate-400 mb-2">Don't see your name?</p>
          <button @click="$emit('register')" class="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg font-bold border border-slate-500">
            + I'm a New Volunteer
          </button>
      </div>
    </div>

    <div v-else class="space-y-8 animate-fade-in">
      <div class="text-center border-b border-slate-700 pb-4">
        <p class="text-slate-400 uppercase text-sm font-bold">Signing in as</p>
        <h2 class="text-4xl font-bold text-white">{{ selectedMember.firstName }} {{ selectedMember.lastName }}</h2>
        <button @click="selectedMember = null" class="text-blue-400 hover:text-blue-300 underline mt-2">Not you? Change person</button>
      </div>

      <div>
        <label class="block text-slate-400 text-sm font-bold uppercase mb-2">What are you working on?</label>
        <input v-model="activity" placeholder="e.g. Setting up rings..." class="w-full p-4 text-xl bg-slate-900 border border-slate-600 rounded-lg text-white focus:border-blue-500 outline-none" />
      </div>

      <div>
          <label class="block text-slate-400 text-sm font-bold uppercase mb-2">Category</label>
          <div class="grid grid-cols-2 gap-4">
            <button @click="category = 'standard'" class="p-4 rounded-lg border-2 font-bold text-lg transition-colors" :class="category === 'standard' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-900 border-slate-600 text-slate-400'">Standard</button>
            <button @click="category = 'maint'" class="p-4 rounded-lg border-2 font-bold text-lg transition-colors" :class="category === 'maint' ? 'bg-green-600 border-green-600 text-white' : 'bg-slate-900 border-slate-600 text-slate-400'">Maintenance 🧹</button>
          </div>
      </div>

      <div class="bg-slate-900 p-4 rounded-lg border border-slate-700">
          <div class="flex items-center gap-4">
            <label class="text-slate-400 font-bold whitespace-nowrap">Start Time:</label>
            <div class="flex gap-2">
              <button @click="startTimeMode = 'now'" class="px-4 py-2 rounded text-sm font-bold" :class="startTimeMode === 'now' ? 'bg-yellow-600 text-white' : 'bg-slate-700 text-slate-400'">NOW</button>
              <button @click="startTimeMode = 'custom'" class="px-4 py-2 rounded text-sm font-bold" :class="startTimeMode === 'custom' ? 'bg-yellow-600 text-white' : 'bg-slate-700 text-slate-400'">Pick Time</button>
            </div>
            <input v-if="startTimeMode === 'custom'" type="time" v-model="customStartTime" class="ml-auto bg-slate-800 text-white border border-slate-600 p-2 rounded" />
            <span v-else class="ml-auto font-mono text-yellow-500">{{ new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) }}</span>
          </div>
      </div>

      <button @click="handleClockIn" :disabled="!activity" class="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-2xl font-bold py-6 rounded-xl shadow-lg mt-4">CONFIRM SIGN IN</button>
    </div>
  </div>
</template>