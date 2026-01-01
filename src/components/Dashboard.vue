<script setup>
import { ref, computed, watch } from 'vue'
import { signOut } from "firebase/auth"
import { doc, getDoc, setDoc, query, collection, where, getDocs, writeBatch } from "firebase/firestore"
import { db, auth } from '../firebase'

// --- COMPONENTS ---
import ProfileEditor from './ProfileEditor.vue'
import NewMemberForm from './NewMemberForm.vue'
import QuickMemberSearch from './QuickMemberSearch.vue'
import ConsolidateTool from './ConsolidateTool.vue' 

// Dashboard Views
import MemberView from './dashboard/MemberView.vue'
import EventsView from './dashboard/EventsView.vue'
import AdminConsole from './dashboard/AdminConsole.vue'

const props = defineProps({
  user: { type: Object, required: true }
})

// --- STATE ---
const memberData = ref(null)
const targetUser = ref(null) 
const isEditing = ref(false)
const showNewMemberModal = ref(false) 
const error = ref(null)
const refreshKey = ref(0) 

// UI State
const activeTab = ref('membership') 

// Computed
const activeUser = computed(() => targetUser.value || memberData.value)
const isViewingSelf = computed(() => activeUser.value && activeUser.value.uid === props.user.uid)
const isAdmin = computed(() => memberData.value?.role === 'admin')
const isManager = computed(() => memberData.value?.role === 'manager')
const isManagerOrAdmin = computed(() => isAdmin.value || isManager.value)

// --- ACTIONS ---
const handleSignOut = () => signOut(auth)

const handleMemberSaved = () => {
  showNewMemberModal.value = false
  refreshKey.value++ 
}

const handleAdminSelectUser = (user) => {
  targetUser.value = user
  if (user) {
    activeTab.value = 'membership' // Auto-switch to Member View
  }
}

// --- DATA SYNC ---
const syncProfile = async () => {
  if (!props.user) return
  error.value = null

  try {
    const docRef = doc(db, "members", props.user.uid)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      memberData.value = { ...docSnap.data(), uid: props.user.uid }
    } 
    else {
      // Claim Profile Logic
      const emailQuery = query(collection(db, "members"), where("email", "==", props.user.email))
      const emailSnap = await getDocs(emailQuery)

      if (!emailSnap.empty) {
        const oldProfileDoc = emailSnap.docs[0]
        const oldData = oldProfileDoc.data()
        
        const batch = writeBatch(db)
        batch.set(docRef, {
          ...oldData,
          uid: props.user.uid,
          status: 'Active',
          claimedAt: new Date()
        })

        const logsQuery = query(collection(db, "logs"), where("memberId", "==", oldProfileDoc.id))
        const logsSnap = await getDocs(logsQuery)
        
        logsSnap.forEach(logDoc => {
          batch.update(logDoc.ref, { memberId: props.user.uid })
        })

        batch.delete(oldProfileDoc.ref)
        await batch.commit()

        memberData.value = { ...oldData, uid: props.user.uid, status: 'Active' }
      } 
      else {
        const newProfile = {
          email: props.user.email,
          firstName: "New",
          lastName: "Member",
          role: "member",
          membershipType: "Regular",
          status: "Active",
          joinedDate: new Date().toISOString()
        }
        await setDoc(docRef, newProfile)
        memberData.value = { ...newProfile, uid: props.user.uid }
      }
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

    <div v-if="isManagerOrAdmin" class="mb-6 flex justify-end">
       <QuickMemberSearch @select="handleAdminSelectUser" />
    </div>

    <div v-if="isManagerOrAdmin" class="flex gap-4 mb-6 border-b overflow-x-auto">
      <button 
        @click="activeTab = 'membership'"
        class="pb-2 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap"
        :class="activeTab === 'membership' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
      >
        Member View
      </button>
      
      <!--button @click="activeTab = 'events'" class="pb-2 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap"  :class="activeTab === 'events' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'" >Events</button-->

      <button 
        @click="activeTab = 'admin'"
        class="pb-2 px-4 font-bold text-sm border-b-2 transition-colors whitespace-nowrap"
        :class="activeTab === 'admin' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
      >
        Admin Console
      </button>
    </div>

    <div v-if="!isManagerOrAdmin || activeTab === 'membership'" class="animate-fade-in">
      
      <MemberView
        :user="activeUser"
        :currentUserRole="memberData.role"
        :isViewingSelf="isViewingSelf"
        @close="targetUser = null"
        @edit="isEditing = true"
      />
    </div>

    <div v-if="isManagerOrAdmin && activeTab === 'events'" class="animate-fade-in">
      <EventsView 
        :user="activeUser" 
        :currentUserRole="memberData.role" 
      />
    </div>

    <div v-if="isManagerOrAdmin && activeTab === 'admin'" class="animate-fade-in">

      <AdminConsole
        :currentUser="memberData"
        :refreshKey="refreshKey"
        @select-user="handleAdminSelectUser"
        @add-member="showNewMemberModal = true"
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