<script setup>
import { ref, onMounted } from 'vue'
import { onAuthStateChanged, signOut } from "firebase/auth"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { auth, db } from './firebase'

import Login from './components/auth/Login.vue' 
import Dashboard from './components/dashboard/Dashboard.vue'
import KioskMode from './components/kiosk/KioskMode.vue'

const user = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const currentPath = ref(window.location.pathname)
const isKiosk = ref(window.location.pathname === '/kiosk')

const emergencySignOut = async () => {
  await signOut(auth)
  window.location.reload()
}

onMounted(() => {
  window.addEventListener('popstate', () => { isKiosk.value = window.location.pathname === '/kiosk' })

  onAuthStateChanged(auth, async (currentUser) => {
    loading.value = true
    errorMessage.value = ''
    
    try {
      if (currentUser) {
        console.log("Auth UID:", currentUser.uid) // CHECK CONSOLE FOR THIS
        
        // 1. Try to Read
        const docRef = doc(db, "members", currentUser.uid)
        let snap = null
        
        try {
          snap = await getDoc(docRef)
        } catch (readErr) {
          console.error("Read Failed. This usually means a Rules issue or ID mismatch.")
          console.error("Trying to read Document ID:", currentUser.uid)
          throw readErr
        }

        // 2. If missing, Auto-Fix
        if (!snap.exists()) {
          console.warn("Doc missing. Attempting creation...")
          const newProfile = { 
            uid: currentUser.uid, 
            email: currentUser.email, 
            role: 'member', 
            firstName: 'New', 
            lastName: 'Member', 
            status: 'Active',
            createdAt: serverTimestamp() 
          }
          await setDoc(docRef, newProfile)
          user.value = { ...newProfile, createdAt: new Date() } // Local fallback
        } else {
          user.value = { ...snap.data(), uid: currentUser.uid }
        }
      } else {
        user.value = null
      }
    } catch (err) {
      console.error("CRITICAL LOAD ERROR:", err)
      errorMessage.value = err.message
      // FORCE LOGIN: We create a fake user object so the Dashboard loads 
      // and you aren't stuck on a white screen.
      user.value = { 
        uid: currentUser?.uid, 
        email: currentUser?.email, 
        firstName: 'Error', 
        lastName: 'Mode', 
        role: 'member' 
      }
    } finally {
      loading.value = false
    }
  })
})
</script>

<template>
  <div v-if="loading" class="h-screen flex flex-col items-center justify-center bg-gray-100 gap-6">
    <div class="text-2xl font-bold text-gray-600 animate-pulse">Loading Profile...</div>
    <button @click="emergencySignOut" class="bg-white border-2 border-red-400 text-red-600 px-6 py-3 rounded-lg shadow hover:bg-red-50 font-bold">⚠️ Emergency Sign Out</button>
  </div>

  <div v-else>
    <div v-if="errorMessage" class="bg-red-600 text-white px-4 py-2 text-center font-bold">
      SYSTEM ERROR: {{ errorMessage }} <br>
      <span class="text-sm font-normal opacity-80">(Check Console for details)</span>
    </div>

    <Login v-if="!user" />
    <KioskMode v-else-if="isKiosk" />
    <Dashboard v-else :user="user" />
  </div>
</template>