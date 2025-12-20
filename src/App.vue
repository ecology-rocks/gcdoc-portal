<script setup>
import { ref, onMounted } from 'vue'
import { onAuthStateChanged } from "firebase/auth"
import { auth } from './firebase'
import Login from './components/Login.vue'
import Dashboard from './components/Dashboard.vue'

const user = ref(null)
const loading = ref(true)

onMounted(() => {
  const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
    user.value = currentUser
    loading.value = false
  })
  // Cleanup is handled automatically in Vue for component unmounts usually, 
  // but strictly strictly speaking onAuthStateChanged returns an unsub function.
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 font-sans text-gray-900">
    <div v-if="loading" class="p-10 text-center">
      Loading application...
    </div>
    <div v-else>
      <Dashboard v-if="user" :user="user" />
      <Login v-else />
    </div>
  </div>
</template>