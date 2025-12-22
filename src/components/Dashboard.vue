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
import LegacyLinkTool from './LegacyLinkTool.vue' // <--- IMPORTED

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
const refreshKey = ref(0) // Used to force reload of member lists

// Computed properties for determining view state
const activeUser = computed(() => targetUser.value || memberData.value)
const isViewingSelf = computed(() => activeUser.value && activeUser.value.uid === props.user.uid)
const isAdmin = computed(() => memberData.value?.role === 'admin')

const handleSignOut = () => {
  signOut(auth)
}

const handleMemberSaved = () => {
  showNewMemberModal.value = false
  refreshKey.value++ // Reload lists
}

const syncProfile = async () => {
  try {
    if (!props.user) return

    // STEP 1: Check for Legacy Data
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

        memberData.value = {
          ...validProfileData,
          email: props.user.email,
          uid: props.user.uid
        }
      }

      await batch.commit()
      alert("Success! We found your old volunteer hours and moved them to your new account.")
      return
    }

    // STEP 2: Normal Load (No legacy data found)
    const docRef = doc(db, "members", props.user.uid)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      memberData.value = { ...docSnap.data(), uid: props.user.uid }
    } else {
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

  } catch (err) {
    console.error("Error syncing profile:", err)
    if (err.code !== 'permission-denied') {
      error.value = err.message
    }
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
  <div v-if="error" class="p-6 text-red-600">Error: {{ error }}</div>
  <div v-else-if="!memberData" class="p-6">Loading profile...</div>

  <div v-else class="p-6 max-w-4xl mx-auto">
    <header class="flex justify-between items-center mb-8 border-b pb-4">
      <div>
        <h1 class="text-3xl font-bold text-gray-800">Member Portal</h1>
        <p class="text-gray-500">
          Logged in as {{ memberData.firstName }} {{ memberData.lastName }}
          <span v-if="isAdmin" class="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">ADMIN</span>
        </p>
      </div>
      <button
        @click="handleSignOut"
        class="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300 transition"
      >
        Sign Out
      </button>
    </header>

    <div v-if="isAdmin" class="mb-12 border-t pt-8">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-gray-800">Admin Dashboard</h2>
        
        <button 
          @click="showNewMemberModal = true"
          class="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 font-bold flex items-center gap-2"
        >
          <span>+</span> Add New Member
        </button>
      </div>

      <Accordion title="⚠️ Pending Review" color="orange">
        <AdminPendingReview />
      </Accordion>

      <Accordion title="🔗 Manual Data Link" color="purple">
        <LegacyLinkTool />
      </Accordion>

      <Accordion title="📝 Bulk Entry (Handwritten Sheets)" color="gray" :defaultOpen="!!resumeSheet">
        <BulkEntryTool
          :resumeSheet="resumeSheet"
          @clear-resume="clearResume"
        />
        <SheetArchive @resume="(sheet) => resumeSheet = sheet" />
      </Accordion>

      <Accordion title="💾 Import & Export Data" color="gray">
        <AdminDataTools />
      </Accordion>

      <Accordion title="🧹 Database Cleanup" color="red">
        <DeduplicateTool :user="user" />
      </Accordion>

      <Accordion title="👤 Log Hours for Others" color="blue" :defaultOpen="true">
        <AdminMemberSelect :key="refreshKey" @select="(m) => targetUser = m" />
      </Accordion>
    </div>

    <div 
      class="p-6 rounded shadow mb-6 transition-colors relative"
      :class="isViewingSelf ? 'bg-white' : 'bg-blue-50 border-2 border-blue-300'"
    >
      <div class="flex justify-between items-start mb-4">
        <h2 class="text-xl font-bold text-gray-800">
          {{ isViewingSelf ? "My Membership" : `Viewing: ${activeUser.firstName} ${activeUser.lastName}` }}
        </h2>

        <div class="flex gap-2">
          <button v-if="!isViewingSelf" @click="targetUser = null" class="text-sm text-blue-600 underline mr-2">
            Back to Me
          </button>
          <button
            @click="isEditing = true"
            class="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold px-3 py-1 rounded"
          >
            Edit Profile
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase">Contact</label>
          <p class="font-semibold">{{ activeUser.firstName }} {{ activeUser.lastName }}</p>
          <p>{{ activeUser.email }}</p>
          <p class="mt-1 text-sm text-gray-600">{{ activeUser.phone || activeUser.cellPhone || "No phone listed" }}</p>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase">Address</label>
          <p class="text-sm text-gray-800">
            <template v-if="activeUser.address">
              {{ activeUser.address }}<br />
              {{ activeUser.city }}, {{ activeUser.state }} {{ activeUser.zip }}
            </template>
            <span v-else>No address listed</span>
          </p>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase">Status</label>
          <p><span class="font-bold">Type:</span> {{ activeUser.membershipType || "Regular" }}</p>
          <p><span class="font-bold">Role:</span> <span class="capitalize">{{ activeUser.role }}</span></p>
        </div>
      </div>
    </div>

    <ProfileEditor
      v-if="isEditing"
      :targetUser="activeUser"
      :currentUserRole="memberData.role"
      @close="isEditing = false"
      @save="handleProfileUpdate"
    />

    <VolunteerLogs
      :key="activeUser.uid"
      :user="activeUser"
      :currentUserRole="memberData.role"
    />

    <NewMemberForm
      v-if="showNewMemberModal"
      @close="showNewMemberModal = false"
      @saved="handleMemberSaved"
    />

  </div>
</template>