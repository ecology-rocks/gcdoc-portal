<script setup>
import { ref, onMounted, defineAsyncComponent } from 'vue'
import { collection, onSnapshot, query, orderBy, getDocs } from "firebase/firestore"
import { db } from '../firebase'

const KioskHome = defineAsyncComponent(() => import('./kiosk/KioskHome.vue'))
const KioskSignIn = defineAsyncComponent(() => import('./kiosk/KioskSignIn.vue'))
const KioskRegister = defineAsyncComponent(() => import('./kiosk/KioskRegister.vue'))
const KioskSignOut = defineAsyncComponent(() => import('./kiosk/KioskSignOut.vue'))

// --- STATE ---
const mode = ref('home')
const successMessage = ref('')
const activeSessions = ref([])
const members = ref([])
const sessionToOut = ref(null)
const pendingMember = ref(null) // <--- NEW: Stores the user who just registered

// --- DATA FETCHING ---
onMounted(async () => {
  const q = query(collection(db, "active_sessions"), orderBy("signInTime", "desc"))
  onSnapshot(q, (snap) => {
    activeSessions.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  })
  loadMembers()
})

const loadMembers = async () => {
  try {
    const combined = []
    const memSnap = await getDocs(collection(db, "members"))
    memSnap.forEach(d => {
        if(d.data().status !== 'Inactive') 
            combined.push({ id: d.id, ...d.data(), type: 'registered' })
    })
    const legSnap = await getDocs(collection(db, "legacy_members"))
    legSnap.forEach(d => {
        if(d.data().status !== 'Inactive')
            combined.push({ id: d.id, ...d.data(), type: 'legacy', realId: d.id })
    })
    combined.sort((a,b) => (a.lastName || "").localeCompare(b.lastName || ""))
    members.value = combined
  } catch(e) {
    console.error(e)
  }
}

// --- HANDLERS ---
const goHome = () => { 
  mode.value = 'home'
  sessionToOut.value = null
  pendingMember.value = null // Reset pending
}

const goSignIn = () => { 
  pendingMember.value = null // Normal sign in starts fresh
  mode.value = 'signin' 
}

const goRegister = () => { mode.value = 'register' }

const startSignOut = (session) => {
  sessionToOut.value = session
  mode.value = 'signout'
}

const showSuccess = (msg) => {
  successMessage.value = msg
  setTimeout(() => {
    successMessage.value = ''
    goHome()
  }, 2500)
}

const handleRegistrationSuccess = (newMember) => {
  members.value.push(newMember)
  members.value.sort((a,b) => (a.lastName || "").localeCompare(b.lastName || ""))
  
  // --- THE FIX ---
  pendingMember.value = newMember // Store the new member
  mode.value = 'signin'           // Switch to sign in view
}
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-white font-sans p-6 flex flex-col">
    
    <header class="flex justify-between items-end mb-6 border-b border-slate-700 pb-4">
      <div>
        <h1 class="text-2xl font-bold text-yellow-500 tracking-wider">GCDOC VOLUNTEER KIOSK</h1>
        <p class="text-slate-400 text-sm">Tablet Mode v2.1</p>
      </div>
      <div v-if="mode === 'home'" class="text-right">
        <div class="text-3xl font-mono font-bold">{{ new Date().toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'}) }}</div>
        <div class="text-slate-400 text-sm">{{ new Date().toLocaleDateString() }}</div>
      </div>
      <button v-else @click="goHome" class="bg-slate-700 px-6 py-2 rounded text-sm font-bold">Cancel / Back</button>
    </header>

    <Transition name="fade" mode="out-in">
      <KioskHome 
        v-if="mode === 'home'" 
        :activeSessions="activeSessions"
        @start-signin="goSignIn"
        @start-signout="startSignOut"
      />

      <KioskSignIn 
        v-else-if="mode === 'signin'"
        :members="members"
        :initialMember="pendingMember" 
        @register="goRegister"
        @success="showSuccess('You are Signed In')" 
      />

      <KioskRegister 
        v-else-if="mode === 'register'"
        @success="handleRegistrationSuccess"
        @cancel="goSignIn"
      />

      <KioskSignOut 
        v-else-if="mode === 'signout'"
        :session="sessionToOut"
        @success="showSuccess('Signed Out')"
      />
    </Transition>

    <div v-if="successMessage" class="fixed inset-0 bg-green-600 z-50 flex flex-col items-center justify-center animate-fade-in">
       <div class="bg-white rounded-full p-8 mb-6 shadow-2xl">
         <span class="text-8xl">👍</span>
       </div>
       <h1 class="text-6xl font-black text-white uppercase tracking-wider mb-2">
         {{ successMessage }}
       </h1>
       <p class="text-2xl text-green-100">Thank you!</p>
    </div>

  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.animate-fade-in { animation: fadeIn 0.3s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
</style>