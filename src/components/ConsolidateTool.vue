<script setup>
import { ref } from 'vue'
import { collection, getDocs, doc, writeBatch } from "firebase/firestore"
import { db } from '../firebase'

const logs = ref([])
const loading = ref(false)
const finished = ref(false)

// I am only committing this file once, in case I need access to the migration code again.

const log = (msg) => logs.value.push(msg)

const startConsolidation = async () => {
  if (!confirm("This will copy ALL legacy data into the main tables. Have you backed up your data first?")) return
  
  loading.value = true
  logs.value = []
  
  try {
    log("🚀 Starting consolidation...")

    // 1. Map existing Active Members by Email (to prevent duplicates)
    log("• Indexing active members...")
    const activeEmailMap = new Map()
    const membersSnap = await getDocs(collection(db, "members"))
    membersSnap.forEach(d => {
      const data = d.data()
      if (data.email) activeEmailMap.set(data.email.toLowerCase(), d.id)
    })
    log(`  Found ${activeEmailMap.size} active members.`)

    // 2. Fetch Legacy Members
    log("• Fetching legacy data...")
    const legacySnap = await getDocs(collection(db, "legacy_members"))
    log(`  Found ${legacySnap.size} legacy profiles to process.`)

    const batchSize = 400
    let batch = writeBatch(db)
    let opCount = 0
    let membersCreated = 0
    let logsMoved = 0
    let profilesMerged = 0 // <--- ADD THIS

    const commitBatch = async () => {
      if (opCount > 0) {
        await batch.commit()
        batch = writeBatch(db)
        opCount = 0
      }
    }

    // 3. Process Each Legacy Member
    for (const legDoc of legacySnap.docs) {
      const lData = legDoc.data()
      const lEmail = (lData.email || "").toLowerCase()
      
      // Determine Target ID (Existing Active Member OR New ID)
      let targetId = activeEmailMap.get(lEmail)
      let isMerge = !!targetId

      if (!targetId) {
        // No active user found -> Move Legacy Profile to Members
        targetId = legDoc.id // Keep the old ID for consistency
        
        const newMemberRef = doc(db, "members", targetId)
        batch.set(newMemberRef, {
          ...lData,
          status: 'Unregistered', // Mark them so they don't look like regular users
          role: 'member',
          legacyImport: true,
          migratedAt: new Date()
        })
        membersCreated++
        opCount++
      } else {
        log(`  > Merging legacy data for ${lEmail} into existing user.`)
        profilesMerged++
      }

      // 4. Move Subcollection Logs
      const subLogSnap = await getDocs(collection(db, "legacy_members", legDoc.id, "legacyLogs"))
      
      for (const logDoc of subLogSnap.docs) {
        const logData = logDoc.data()
        // Create new log in root collection
        const newLogRef = doc(collection(db, "logs")) // Auto-ID for the log
        
        batch.set(newLogRef, {
          ...logData,
          memberId: targetId, // Link to the new (or existing) main profile
          migratedFrom: legDoc.id
        })
        logsMoved++
        opCount++

        if (opCount >= batchSize) await commitBatch()
      }

      if (opCount >= batchSize) await commitBatch()
    }

    // Final Commit
    await commitBatch()
    
    finished.value = true
    log("✅ Consolidation Complete!")
    log(`• Created/Migrated Profiles: ${membersCreated}`)
    log(`• Logs Moved to Root: ${logsMoved}`)
    log("NOTE: Legacy data was COPIED, not deleted. You can delete the 'legacy_members' collection after verifying.")

  } catch (err) {
    console.error(err)
    log(`❌ Error: ${err.message}`)
  }
  loading.value = false
}
</script>

<template>
  <div class="p-6 bg-white rounded shadow max-w-2xl mx-auto my-10 border border-blue-200">
    <h2 class="text-2xl font-bold mb-4 text-blue-800">database_unification_tool.exe</h2>
    
    <div class="bg-blue-50 p-4 rounded text-sm text-blue-900 mb-6">
      <p class="font-bold">What this does:</p>
      <ul class="list-disc ml-5 mt-2 space-y-1">
        <li>Reads all <strong>legacy_members</strong>.</li>
        <li>If they exist in <strong>members</strong> (by email), their logs are moved to the existing user.</li>
        <li>If they don't exist, they are copied to <strong>members</strong> with status <code>Unregistered</code>.</li>
        <li>All <strong>legacyLogs</strong> are moved to the main <strong>logs</strong> collection.</li>
      </ul>
    </div>

    <button 
      @click="startConsolidation" 
      :disabled="loading || finished"
      class="w-full py-3 rounded font-bold text-white shadow transition-colors mb-6"
      :class="finished ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'"
    >
      {{ loading ? 'Processing...' : finished ? 'Migration Complete' : 'Start Consolidation' }}
    </button>

    <div class="bg-gray-900 text-green-400 p-4 rounded h-64 overflow-y-auto font-mono text-xs">
      <div v-if="logs.length === 0" class="text-gray-500 italic">Waiting to start...</div>
      <div v-for="(l, i) in logs" :key="i" class="border-b border-gray-800 pb-1 mb-1 last:border-0">{{ l }}</div>
    </div>
  </div>
</template>