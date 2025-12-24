<script setup>
import { ref, computed, watch } from 'vue'
import { signOut } from "firebase/auth"
import { doc, getDoc, setDoc, query, collection, where, getDocs, writeBatch } from "firebase/firestore"
import { db, auth } from '../firebase'

// Child components
import VolunteerLogs from './VolunteerLogs.vue'
import ProfileEditor from './ProfileEditor.vue'
import AdminDataTools from './AdminDataTools.vue'
import AdminMemberSelect from './AdminMemberSelect.vue'
import DeduplicateTool from './DeduplicateTool.vue'
import AdminPendingReview from './AdminPendingReview.vue'
import BulkEntryTool from './BulkEntryTool.vue'
import SheetArchive from './SheetArchive.vue'
import Accordion from './Accordion.vue'
import NewMemberForm from './NewMemberForm.vue'
import LegacyLinkTool from './LegacyLinkTool.vue'
import QuickMemberSearch from './QuickMemberSearch.vue'

const props = defineProps({
  user: {
    type: Object,
    required: true
  }
})

const memberData = ref(null)
const targetUser = ref(null)
const isEditing = ref(false)
const showNewMemberModal = ref(false) 
const error = ref(null)
const resumeSheet = ref(null)
const refreshKey = ref(0) 

// UI State
const activeTab = ref('membership') 
const emailCopyStatus = ref('') 

// Computed properties
const activeUser = computed(() => targetUser.value || memberData.value)
const isViewingSelf = computed(() => activeUser.value && activeUser.value.uid === props.user.uid)

// PERMISSIONS
const isAdmin = computed(() => memberData.value?.role === 'admin')
const isManager = computed(() => memberData.value?.role === 'manager')
const isManagerOrAdmin = computed(() => isAdmin.value || isManager.value)

const handleSignOut = () => {
  signOut(auth)
}

const handleMemberSaved = () => {
  showNewMemberModal.value = false
  refreshKey.value++ 
}

const handleAdminSelectUser = (user) => {
  targetUser.value = user
  if (user) {
    activeTab.value = 'membership'
  }
}

const copyEmail = async (email) => {
  if (!email) return
  try {
    await navigator.clipboard.writeText(email)
    emailCopyStatus.value = 'Copied!'
    setTimeout(() => emailCopyStatus.value = '', 2000)
  } catch (err) {
    console.error(err)
    alert('Failed to copy email')
  }
}

// --- FIXED SYNC PROFILE FUNCTION ---
const syncProfile = async () => {
  if (!props.user) return
  error.value = null

  try {
    // 1. LOAD PROFILE FIRST (This ensures the UI always loads)
    const docRef = doc(db, "members", props.user.uid)
    let docSnap = null

    try {
      docSnap = await getDoc(docRef)
    } catch (readErr) {
      // If we can't read our own profile, something is critically wrong with Rules
      console.error("Critical Profile Read Error:", readErr)
      throw readErr 
    }

    if (docSnap.exists()) {
      memberData.value = { ...docSnap.data(), uid: props.user.uid }
    } else {
      // Create new profile if missing
      const newProfile = {
        email: props.user.email,
        firstName: "New",
        lastName: "Member",
        role: "member",
        membershipType: "Regular"
      }
      await setDoc(docRef, newProfile)
      memberData.value = { ...newProfile, uid: props.user.uid }
    }

    // 2. CHECK FOR LEGACY DATA (Merge attempt)
    // We wrap this in a try/catch so if it fails (permissions), it doesn't crash the whole app
    try {
      const legacyQuery = query(collection(db, "legacy_members"), where("email", "==", props.user.email))
      const legacySnap = await getDocs(legacyQuery)

      if (!legacySnap.empty) {
        console.log("Found legacy data. Merging...")
        const batch = writeBatch(db)
        let foundProfileData = null

        for (const legacyDoc of legacySnap.docs) {
          const legacyData = legacyDoc.data()
          if (!foundProfileData) foundProfileData = legacyData

          const legacyLogsRef = collection(db, "legacy_members", legacyDoc.id, "legacyLogs")
          const legacyLogsSnap = await getDocs(legacyLogsRef)

          legacyLogsSnap.forEach(logDoc => {
            const newLogRef = doc(collection(db, "logs"))
            batch.set(newLogRef, {
              ...logDoc.data(),
              memberId: props.user.uid,
              status: "approved",
              importedAt: new Date()
            })
          })
          batch.delete(legacyDoc.ref)
        }

        if (foundProfileData) {
          const profileRef = doc(db, "members", props.user.uid)
          // eslint-disable-next-line no-unused-vars
          const { legacyLogs, legacyKey, ...validProfileData } = foundProfileData

          batch.set(profileRef, {
            ...validProfileData,
            email: props.user.email,
            uid: props.user.uid
          }, { merge: true })

          // Update local state to reflect the merge
          memberData.value = {
            ...validProfileData,
            email: props.user.email,
            uid: props.user.uid
          }
        }

        await batch.commit()
        alert("Success! We found your old volunteer hours and moved them to your new account.")
      }
    } catch (legacyErr) {
      console.warn("Legacy merge check failed (likely permissions). Skipping.", legacyErr)
      // We do NOT throw here. We just let the user proceed with their empty profile.
    }

  } catch (err) {
    console.error("Error loading profile:", err)
    error.value = err.message
  }
}

watch(() => props.user, syncProfile, { immediate: true })

const handleProfileUpdate = (newData) => {
  if (activeUser.value.uid === props.user.uid) {
    memberData.value = { ...memberData.value, ...newData }
  }
  if (targetUser.value && activeUser.value.uid === targetUser.value.uid) {
    targetUser.value = { ...targetUser.value, ...newData }
  }
}

const clearResume = () => {
  resumeSheet.value = null
}
</script>

<template>
  <div v-if="error" class="p-6 text-red-600 bg-red-50 border-l-4 border-red-600">
    <h3 class="font-bold">Error Loading Dashboard</h3>
    <p>{{ error }}</p>
    <button @click="handleSignOut" class="mt-4 underline">Sign Out</button>
  </div>
  
  <div v-else-if="!memberData" class="p-6 flex items-center justify-center h-64">
    <div class="text-xl text-gray-400 animate-pulse">Loading profile...</div>
  </div>

  <div v-else class="p-6 max-w-4xl mx-auto">
    
    <header class="flex flex-col md:flex-row justify-between items-center mb-6 pb-4 border-b">
      <div>
        <h1 class="text-3xl font-bold text-gray-800">Member Portal</h1>
        <p class="text-gray-500 text-sm">
          Welcome, <strong>{{ memberData.firstName }}</strong>
          <span v-if="isAdmin" class="ml-2 bg-blue-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">Admin</span>
          <span v-else-if="isManager" class="ml-2 bg-purple-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">Manager</span>
        </p>
      </div>
      <button
        @click="handleSignOut"
        class="mt-4 md:mt-0 text-sm text-gray-600 hover:text-red-600 font-bold border border-gray-300 px-4 py-2 rounded hover:bg-gray-50 transition"
      >
        Sign Out
      </button>
    </header>

    <div v-if="isManagerOrAdmin" class="flex gap-4 mb-6 border-b">
      <button 
        @click="activeTab = 'membership'"
        class="pb-2 px-4 font-bold text-sm border-b-2 transition-colors"
        :class="activeTab === 'membership' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
      >
        Member View
      </button>
      <button 
        @click="activeTab = 'admin'"
        class="pb-2 px-4 font-bold text-sm border-b-2 transition-colors"
        :class="activeTab === 'admin' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
      >
        Admin Console
      </button>
    </div>

    <div v-if="isManagerOrAdmin && activeTab === 'admin'" class="animate-fade-in">
      
      <div v-if="isAdmin" class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-bold text-gray-700">Administrative Tools</h2>
        <button 
          @click="showNewMemberModal = true"
          class="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 font-bold flex items-center gap-2 text-sm"
        >
          <span>+</span> Add New Member
        </button>
      </div>
      <div v-else class="mb-6">
        <h2 class="text-xl font-bold text-gray-700">Manager Tools</h2>
      </div>

      <div class="grid gap-6">
        
        <Accordion title="📝 Bulk Entry (Handwritten Sheets)" color="gray" :defaultOpen="!!resumeSheet">
          <BulkEntryTool
            :resumeSheet="resumeSheet"
            :currentUser="user" 
            @clear-resume="clearResume"
          />
          <SheetArchive 
            :currentUser="user" 
            @resume="(sheet) => resumeSheet = sheet" 
          />
        </Accordion>

        <Accordion title="👤 Log Hours for Others" color="blue">
           <AdminMemberSelect :key="refreshKey" @select="handleAdminSelectUser" />
           <p class="text-xs text-blue-800 mt-2 bg-blue-50 p-2 rounded">
             * Selecting a user here will automatically switch you to the "Member View" tab to edit their logs.
           </p>
        </Accordion>

        <template v-if="isAdmin">
          <Accordion title="⚠️ Pending Review / Applicants" color="orange">
            <AdminPendingReview />
          </Accordion>

          <Accordion title="🔗 Manual Data Link (Orphans)" color="purple">
            <LegacyLinkTool />
          </Accordion>

          <Accordion title="💾 Import & Export Data" color="gray">
            <AdminDataTools />
          </Accordion>

          <Accordion title="🧹 Database Cleanup" color="red">
            <DeduplicateTool :user="user" />
          </Accordion>
        </template>
        
      </div>
    </div>

    <div v-if="!isManagerOrAdmin || activeTab === 'membership'" class="animate-fade-in">
      
      <div v-if="isManagerOrAdmin" class="mb-6 flex justify-end">
         <QuickMemberSearch @select="handleAdminSelectUser" />
      </div>

      <div v-if="!isViewingSelf" class="bg-blue-600 text-white p-3 rounded-t flex justify-between items-center shadow-lg transform translate-y-2 relative z-10">
        <span class="font-bold text-sm">
          👁️ Viewing: {{ activeUser.firstName }} {{ activeUser.lastName }}
        </span>
        <button 
          @click="targetUser = null" 
          class="bg-white text-blue-600 text-xs font-bold px-3 py-1 rounded hover:bg-blue-50"
        >
          Close (Return to Me)
        </button>
      </div>

      <div 
        class="p-6 rounded shadow mb-8 bg-white border border-gray-200 relative z-0"
        :class="{ 'rounded-t-none border-t-0': !isViewingSelf }"
      >
        <div class="flex justify-between items-start mb-6">
          <h2 class="text-2xl font-bold text-gray-800">
            {{ isViewingSelf ? "My Membership" : "Member Profile" }}
          </h2>
          <button
            @click="isEditing = true"
            class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold px-3 py-2 rounded border"
          >
            Edit Details
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Contact</label>
            <p class="font-bold text-gray-800 text-lg">{{ activeUser.firstName }} {{ activeUser.lastName }}</p>
            
            <div 
              @click="copyEmail(activeUser.email)" 
              class="group flex items-center gap-2 cursor-pointer w-max"
              title="Click to copy email"
            >
              <p class="text-gray-600 group-hover:text-blue-600 transition-colors">
                {{ activeUser.email }}
              </p>
              
              <span v-if="emailCopyStatus" class="text-[10px] uppercase font-bold text-green-700 bg-green-50 px-1.5 rounded border border-green-200">
                {{ emailCopyStatus }}
              </span>
              <span v-else class="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity text-sm">
                📋
              </span>
            </div>

            <p class="text-gray-600">{{ activeUser.phone || activeUser.cellPhone || "No phone listed" }}</p>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Address</label>
            <p class="text-gray-800">
              <template v-if="activeUser.address">
                {{ activeUser.address }}<br />
                {{ activeUser.city }}, {{ activeUser.state }} {{ activeUser.zip }}
              </template>
              <span v-else class="text-gray-400 italic">No address listed</span>
            </p>
          </div>

          <div class="bg-gray-50 p-3 rounded border border-gray-100">
            <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Details</label>
            
            <div class="flex justify-between items-center mb-1">
              <span class="text-gray-600 text-sm">Status:</span>
              <span class="font-bold text-gray-800">{{ activeUser.status || 'Active' }}</span>
            </div>

            <div class="flex justify-between items-center mb-1">
              <span class="text-gray-600 text-sm">Type:</span>
              <span class="font-bold text-gray-800">{{ activeUser.membershipType || "Regular" }}</span>
            </div>
            
            <div class="flex justify-between items-center">
              <span class="text-gray-600 text-sm">Role:</span>
              <span class="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded capitalize">{{ activeUser.role }}</span>
            </div>
          </div>
        </div>
      </div>

      <VolunteerLogs
        :key="activeUser.uid"
        :user="activeUser"
        :currentUserRole="memberData.role"
      />
    </div>

    <ProfileEditor
      v-if="isEditing"
      :targetUser="activeUser"
      :currentUserRole="memberData.role"
      @close="isEditing = false"
      @save="handleProfileUpdate"
    />

    <NewMemberForm
      v-if="showNewMemberModal"
      @close="showNewMemberModal = false"
      @saved="handleMemberSaved"
    />

  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-in-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>