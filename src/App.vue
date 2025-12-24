<script setup>
import { ref, onMounted } from 'vue'
import { onAuthStateChanged } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from './firebase'

// COMPONENTS
// Updated to use your existing Login component
import Login from './components/Login.vue' 
import Dashboard from './components/Dashboard.vue'
import KioskMode from './components/KioskMode.vue'

const user = ref(null)
const userProfile = ref(null)
const loading = ref(true)

// ROUTING STATE
// Check if the URL ends with /kiosk
const currentPath = ref(window.location.pathname)
const isKiosk = ref(window.location.pathname === '/kiosk')

onMounted(() => {
  // Listen for browser navigation (back/forward buttons) to update view
  window.addEventListener('popstate', () => {
    isKiosk.value = window.location.pathname === '/kiosk'
  })

  // Auth Listener - keeps app in sync with Firebase login state
  onAuthStateChanged(auth, async (currentUser) => {
    if (currentUser) {
      // Fetch extra profile data (role, status)
      const snap = await getDoc(doc(db, "members", currentUser.uid))
      if (snap.exists()) {
        userProfile.value = { ...snap.data(), uid: currentUser.uid }
      } else {
        // Fallback if profile missing
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
    loading.value = false
  })
})
</script>

<template>
  <div v-if="loading" class="h-screen flex items-center justify-center bg-gray-100">
    <div class="text-xl font-bold text-gray-400 animate-pulse">Loading App...</div>
  </div>

  <div v-else>
    
    <Login v-if="!user" />

    <KioskMode v-else-if="isKiosk" />

    <Dashboard v-else :user="user" />

  </div>
</template>

<style>
/* Global resets */
body {
  margin: 0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
</style>