<script setup>
import { ref, onMounted } from 'vue'
import { onAuthStateChanged, signOut } from "firebase/auth" // <--- Import signOut
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from './firebase'

// COMPONENTS
import Login from './components/Login.vue' 
import Dashboard from './components/Dashboard.vue'
import KioskMode from './components/KioskMode.vue'

const user = ref(null)
const userProfile = ref(null)
const loading = ref(true)

// ROUTING STATE
const currentPath = ref(window.location.pathname)
const isKiosk = ref(window.location.pathname === '/kiosk')

// --- EMERGENCY LOGOUT ---
const emergencySignOut = async () => {
  await signOut(auth)
  window.location.reload() // Force reload to clear state
}

onMounted(() => {
  window.addEventListener('popstate', () => {
    isKiosk.value = window.location.pathname === '/kiosk'
  })

  onAuthStateChanged(auth, async (currentUser) => {
    // Wrap in try/catch so errors don't freeze the app on "Loading..."
    try {
      if (currentUser) {
        const snap = await getDoc(doc(db, "members", currentUser.uid))
        if (snap.exists()) {
          userProfile.value = { ...snap.data(), uid: currentUser.uid }
        } else {
          userProfile.value = { 
            uid: currentUser.uid, 
            email: currentUser.email, 
            role: 'member', 
            firstName: 'Member' 
          }
        }
        user.value = userProfile.value
      } else {
        user.value = null
        userProfile.value = null
      }
    } catch (err) {
      console.error("Auth Load Error:", err)
      // Even if there is an error, we stop loading so the user can see *something*
      // (or use the emergency button)
    } finally {
      loading.value = false
    }
  })
})
</script>

<template>
  <div v-if="loading" class="h-screen flex flex-col items-center justify-center bg-gray-100 gap-6">
    <div class="text-xl font-bold text-gray-400 animate-pulse">Loading App...</div>
    
    <button 
      @click="emergencySignOut" 
      class="text-xs text-red-500 hover:text-red-700 underline"
    >
      Stuck? Click here to Emergency Sign Out
    </button>
  </div>

  <div v-else>
    
    <Login v-if="!user" />

    <KioskMode v-else-if="isKiosk" />

    <Dashboard v-else :user="user" />

  </div>
</template>

<style>
body {
  margin: 0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
</style>