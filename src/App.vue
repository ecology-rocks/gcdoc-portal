<script setup>
import { ref, onMounted } from 'vue'
import { onAuthStateChanged, signOut } from "firebase/auth"
import { doc, getDoc, setDoc } from "firebase/firestore" // <--- Added setDoc
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
  try {
    await signOut(auth)
  } catch (e) {
    console.error(e)
  }
  window.location.reload()
}

onMounted(() => {
  window.addEventListener('popstate', () => {
    isKiosk.value = window.location.pathname === '/kiosk'
  })

  onAuthStateChanged(auth, async (currentUser) => {
    loading.value = true
    try {
      if (currentUser) {
        const docRef = doc(db, "members", currentUser.uid)
        const snap = await getDoc(docRef)
        
        if (snap.exists()) {
          userProfile.value = { ...snap.data(), uid: currentUser.uid }
        } else {
          // --- AUTO-FIX: Create missing profile ---
          console.warn("User exists in Auth but missing in DB. creating profile...")
          const newProfile = { 
            uid: currentUser.uid, 
            email: currentUser.email, 
            role: 'member', // Default to basic member
            firstName: 'New',
            lastName: 'Member',
            status: 'Active',
            createdAt: new Date()
          }
          // We can do this now because we updated the Rules to allow self-creation!
          await setDoc(docRef, newProfile)
          userProfile.value = newProfile
        }
        user.value = userProfile.value
      } else {
        user.value = null
        userProfile.value = null
      }
    } catch (err) {
      console.error("Auth Load Error:", err)
      // Even if error, ensure we turn off loading so Emergency Sign Out is visible
    } finally {
      loading.value = false
    }
  })
})
</script>

<template>
  <div v-if="loading" class="h-screen flex flex-col items-center justify-center bg-gray-100 gap-6">
    <div class="text-2xl font-bold text-gray-600 animate-pulse">Loading Profile...</div>
    
    <button 
      @click="emergencySignOut" 
      class="bg-white border-2 border-red-400 text-red-600 px-6 py-3 rounded-lg shadow hover:bg-red-50 font-bold transition"
    >
      ⚠️ Emergency Sign Out
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