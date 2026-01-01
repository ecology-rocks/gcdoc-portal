<script setup>
import { ref } from 'vue'
import { collection, query, where, getDocs, writeBatch, doc } from "firebase/firestore"
import { db } from '../../../firebase'

const props = defineProps({
  user: { type: Object, required: true }
})

const status = ref("Idle")

const handleCleanup = async () => {
  if (!props.user) return
  if (!window.confirm("This will search for duplicate log entries and delete them. Proceed?")) return

  status.value = "Scanning logs..."
  try {
    // 1. Fetch all logs for this user
    const q = query(collection(db, "logs"), where("memberId", "==", props.user.uid))
    const snapshot = await getDocs(q)
    const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

    // 2. Identify Duplicates
    const seen = new Set()
    const duplicates = []

    logs.forEach(log => {
      // Create a unique "signature" for this entry
      const signature = `${log.date}-${log.activity}-${log.hours}`
      
      if (seen.has(signature)) {
        // We have seen this before! It's a duplicate.
        duplicates.push(log.id)
      } else {
        seen.add(signature)
      }
    })

    if (duplicates.length === 0) {
      status.value = "No duplicates found! You are clean."
      return
    }

    // 3. Delete Duplicates
    status.value = `Found ${duplicates.length} duplicates. Deleting...`
    const batch = writeBatch(db)
    
    duplicates.forEach(id => {
      batch.delete(doc(db, "logs", id))
    })

    await batch.commit()
    status.value = `Success! Deleted ${duplicates.length} duplicate entries.`
    
    // Refresh the page after a moment to show clean data
    setTimeout(() => window.location.reload(), 2000)

  } catch (err) {
    console.error(err)
    status.value = "Error: " + err.message
  }
}
</script>

<template>
  <div class="bg-red-50 border border-red-200 p-4 rounded mb-6 text-center">
    <h3 class="font-bold text-red-800 mb-2">Database Cleanup</h3>
    <p class="text-sm text-red-600 mb-3">
      Use this if you accidentally imported your data multiple times.
    </p>
    <button 
      @click="handleCleanup"
      class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 font-bold"
    >
      Find & Remove Duplicates
    </button>
    <p class="mt-2 font-mono text-sm">{{ status }}</p>
  </div>
</template>