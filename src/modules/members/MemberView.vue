<script setup>
import { ref, watch, computed } from 'vue'
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { db, auth } from '../../firebase'

// Components
import VolunteerLogs from './VolunteerLogs.vue'
import VolunteerAvailabilityForm from '../events/VolunteerAvailabilityForm.vue'
import LogHoursForm from './LogHoursForm.vue'
import NotificationToast from '@components/common/NotificationToast.vue'

const props = defineProps({
  user: { type: Object, required: true },
  currentUserRole: { type: String, default: 'member' },
  isViewingSelf: { type: Boolean, default: true }
})

const emit = defineEmits(['close', 'edit'])

// --- STATE ---
const fullProfile = ref({}) 
const loadingProfile = ref(false)

// Stats
const stats = ref({ 
  regularHours: 0, regularVouchers: 0,
  blueRibbonHours: 0, blueRibbonVouchers: 0
})

// UI State
const emailCopyStatus = ref('')
const showSignupModal = ref(false)
const showLogModal = ref(false)
const showEditProfileModal = ref(false) 
const toast = ref({ visible: false, message: '', type: 'success' })

// Editing Logic (Logs)
const logsRef = ref(null)
const editingLog = ref(null) 

// Editing Logic (Profile)
const editForm = ref({})
const savingProfile = ref(false)

// --- HELPERS ---

const targetId = computed(() => props.user.id || props.user.uid)
const isLegacy = computed(() => props.user.type === 'legacy')

// PERMISSION CHECK: Case-insensitive check for Admin
const isAdmin = computed(() => {
  return (props.currentUserRole || '').toLowerCase() === 'admin'
})

const handleNotify = ({ message, type }) => {
  toast.value = { visible: true, message, type }
}

const copyEmail = async (email) => {
  if (!email) return
  try {
    await navigator.clipboard.writeText(email)
    emailCopyStatus.value = 'Copied!'
    setTimeout(() => emailCopyStatus.value = '', 2000)
  } catch (err) { console.error(err) }
}

const updateStats = (newStats) => {
  stats.value = newStats
}

// --- 1. FETCH FULL PROFILE ---
const fetchProfile = async () => {
  if (!targetId.value) return
  
  loadingProfile.value = true
  try {
    let snap
    if (isLegacy.value) {
      snap = await getDoc(doc(db, "legacy_members", targetId.value))
    } else {
      snap = await getDoc(doc(db, "members", targetId.value))
    }

    if (snap.exists()) {
      fullProfile.value = { ...props.user, ...snap.data(), id: snap.id }
    } else {
      fullProfile.value = { ...props.user } 
    }
  } catch (err) {
    console.error("Error fetching profile:", err)
    handleNotify({ message: "Could not load full profile details.", type: "error" })
  }
  loadingProfile.value = false
}

// --- 2. EDIT PROFILE FUNCTIONS ---
const openEditProfile = () => {
  // Populate Form
  editForm.value = {
    firstName: fullProfile.value.firstName || '',
    lastName: fullProfile.value.lastName || '',
    phone: fullProfile.value.phone || fullProfile.value.cellPhone || '',
    email: fullProfile.value.email || '',
    address: fullProfile.value.address || '',
    city: fullProfile.value.city || '',
    state: fullProfile.value.state || 'OH',
    zip: fullProfile.value.zip || '',
    notes: fullProfile.value.notes || '',
    
    // ADMIN FIELDS
    membershipType: fullProfile.value.membershipType || 'Regular',
    role: fullProfile.value.role || 'member'
  }
  showEditProfileModal.value = true
}

const saveProfile = async () => {
  savingProfile.value = true
  try {
    const collectionName = isLegacy.value ? "legacy_members" : "members"
    const docRef = doc(db, collectionName, targetId.value)

    await updateDoc(docRef, {
      ...editForm.value,
      cellPhone: editForm.value.phone, // Ensure consistency
      updatedAt: new Date()
    })

    // Update local view immediately
    fullProfile.value = { ...fullProfile.value, ...editForm.value }
    handleNotify({ message: "Profile updated successfully!", type: "success" })
    showEditProfileModal.value = false
  } catch (err) {
    console.error(err)
    handleNotify({ message: "Save failed: " + err.message, type: "error" })
  }
  savingProfile.value = false
}

// --- 3. LOGGING FUNCTIONS ---
const openLogModal = (log = null) => {
  editingLog.value = log
  showLogModal.value = true
}

const handleLogSaved = () => {
  if (logsRef.value) logsRef.value.fetchLogs()
}

watch(() => props.user, fetchProfile, { immediate: true })
</script>

<template>
  <div class="animate-fade-in relative">
    
    <NotificationToast 
      v-if="toast.visible"
      :message="toast.message" 
      :type="toast.type" 
      @close="toast.visible = false"
    />

    <div v-if="!isViewingSelf" class="bg-blue-600 text-white p-3 rounded-t flex justify-between items-center shadow-lg transform translate-y-2 relative z-10">
      <span class="font-bold text-sm">
        👁️ Viewing: {{ fullProfile.firstName || user.firstName }} {{ fullProfile.lastName || user.lastName }}
        <span v-if="isLegacy" class="ml-2 bg-orange-400 text-black text-[10px] px-1 rounded uppercase font-bold">Legacy</span>
      </span>
      <button @click="$emit('close')" class="bg-white text-blue-600 text-xs font-bold px-3 py-1 rounded hover:bg-blue-50">Close (Return to Me)</button>
    </div>

    <div class="rounded shadow mb-6 bg-white border border-gray-200 relative z-0 overflow-hidden" :class="{ 'rounded-t-none border-t-0': !isViewingSelf }">
      <div class="p-6">
        <div class="flex justify-between items-start mb-6">
          <h2 class="text-2xl font-bold text-gray-800">{{ isViewingSelf ? "My Membership" : "Member Profile" }}</h2>
          
          <button @click="openEditProfile" class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold px-3 py-2 rounded border flex items-center gap-2">
            ✏️ Edit Details
          </button>
        </div>

        <div v-if="loadingProfile" class="animate-pulse space-y-4">
          <div class="h-4 bg-gray-200 rounded w-1/4"></div>
          <div class="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Contact</label>
            <p class="font-bold text-gray-800 text-lg">
              {{ fullProfile.firstName }} {{ fullProfile.lastName }}
            </p>
            
            <div @click="copyEmail(fullProfile.email)" class="group flex items-center gap-2 cursor-pointer w-max mt-1">
              <p class="text-gray-600 group-hover:text-blue-600 transition-colors">{{ fullProfile.email }}</p>
              <span v-if="emailCopyStatus" class="text-[10px] font-bold text-green-700 bg-green-50 px-1 rounded">{{ emailCopyStatus }}</span>
            </div>
            
            <p class="text-gray-600 mt-1">
              {{ fullProfile.phone || fullProfile.cellPhone || "No phone listed" }}
            </p>
            
            <p class="text-gray-600 text-sm mt-2" v-if="fullProfile.address">
              {{ fullProfile.address }}<br>
              {{ fullProfile.city }}{{ fullProfile.city && fullProfile.state ? ',' : '' }} {{ fullProfile.state }} {{ fullProfile.zip }}
            </p>
            <p v-else class="text-gray-400 text-sm italic mt-2">No address on file.</p>
            
            <div v-if="fullProfile.notes" class="mt-3 bg-yellow-50 p-2 rounded border border-yellow-100 text-xs text-gray-600">
               <strong>Notes:</strong> {{ fullProfile.notes }}
            </div>
          </div>

          <div class="bg-gray-50 p-4 rounded border border-gray-100 space-y-3">
             <div class="flex justify-between items-center border-b border-gray-200 pb-2">
                <span class="text-gray-500 text-xs font-bold uppercase">Account Status</span>
                <span class="font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded text-sm">{{ fullProfile.status || 'Active' }}</span>
             </div>
             <div class="flex justify-between items-center">
                <span class="text-gray-500 text-sm">Renewal Eligible</span>
                <span class="font-bold px-2 py-0.5 rounded text-sm border" :class="stats.regularHours >= 20 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-100'">
                  {{ stats.regularHours >= 20 ? 'YES' : 'NO' }}
                </span>
             </div>
             <div class="flex justify-between items-center">
                <span class="text-gray-500 text-sm">Member Type</span>
                <span class="font-bold text-gray-800">{{ fullProfile.membershipType || "Regular" }}</span>
             </div>
             <div class="flex justify-between items-center">
                <span class="text-gray-500 text-sm">Role</span>
                <span class="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded capitalize">{{ fullProfile.role || 'Member' }}</span>
             </div>
          </div>
        </div>
      </div>

      <div class="bg-gray-50 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200 text-center">
         <div class="p-3"><span class="block text-[10px] font-bold text-gray-400 uppercase">Regular Hours</span><span class="block text-xl font-bold text-gray-700">{{ stats.regularHours }}</span></div>
         <div class="p-3 bg-indigo-50"><span class="block text-[10px] font-bold text-indigo-400 uppercase">Regular Vouchers</span><span class="block text-xl font-bold text-indigo-700">{{ stats.regularVouchers }}</span></div>
         <div class="p-3"><span class="block text-[10px] font-bold text-gray-400 uppercase">Blue Ribbon Hours</span><span class="block text-xl font-bold text-blue-600">{{ stats.blueRibbonHours }}</span></div>
         <div class="p-3 bg-blue-50"><span class="block text-[10px] font-bold text-blue-400 uppercase">Blue Ribbon Vouchers</span><span class="block text-xl font-bold text-blue-800">{{ stats.blueRibbonVouchers }}</span></div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4 mb-8">
       <button @click="openLogModal(null)" class="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded shadow flex flex-col items-center justify-center transition-transform hover:-translate-y-0.5">
         <span class="text-2xl mb-1">⏱️</span><span class="font-bold">Log Hours</span>
       </button>
       <button @click="showSignupModal = true" class="bg-green-600 hover:bg-green-700 text-white p-4 rounded shadow flex flex-col items-center justify-center transition-transform hover:-translate-y-0.5">
         <span class="text-2xl mb-1">📅</span><span class="font-bold">Volunteer Signup</span>
       </button>
    </div>

    <VolunteerLogs
      ref="logsRef"
      :key="user.id || user.uid"
      :user="fullProfile.id ? fullProfile : user"
      :currentUserRole="currentUserRole"
      @stats-update="updateStats"
      @edit-log="openLogModal" 
    />

    <div v-if="showEditProfileModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
       <div class="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
          <div class="bg-gray-800 p-4 flex justify-between items-center text-white shrink-0">
             <h3 class="font-bold">Edit Profile</h3>
             <button @click="showEditProfileModal = false" class="hover:text-gray-300">✕</button>
          </div>
          <div class="p-6 space-y-4 overflow-y-auto">
             <div class="grid grid-cols-2 gap-4">
                <div>
                   <label class="block text-xs font-bold text-gray-500 uppercase mb-1">First Name</label>
                   <input v-model="editForm.firstName" class="w-full border rounded p-2" />
                </div>
                <div>
                   <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Last Name</label>
                   <input v-model="editForm.lastName" class="w-full border rounded p-2" />
                </div>
             </div>
             
             <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                <input v-model="editForm.email" type="email" class="w-full border rounded p-2 bg-gray-50" readonly title="Email cannot be changed here" />
                <p class="text-[10px] text-gray-400 mt-1">Email cannot be changed directly.</p>
             </div>

             <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                <input v-model="editForm.phone" class="w-full border rounded p-2" placeholder="(555) 123-4567" />
             </div>

             <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Street Address</label>
                <input v-model="editForm.address" class="w-full border rounded p-2" placeholder="123 Main St" />
             </div>

             <div class="grid grid-cols-3 gap-2">
                <div class="col-span-2">
                   <label class="block text-xs font-bold text-gray-500 uppercase mb-1">City</label>
                   <input v-model="editForm.city" class="w-full border rounded p-2" />
                </div>
                <div>
                   <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Zip</label>
                   <input v-model="editForm.zip" class="w-full border rounded p-2" />
                </div>
             </div>
             
             <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Admin Notes</label>
                <textarea v-model="editForm.notes" rows="2" class="w-full border rounded p-2"></textarea>
             </div>

             <div v-if="isAdmin" class="border-t border-gray-200 pt-4 mt-4 bg-red-50 p-4 rounded -mx-2">
               <h4 class="text-xs font-bold text-red-600 uppercase mb-3">Admin Controls</h4>
               <div class="grid grid-cols-2 gap-4">
                 <div>
                   <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Member Type</label>
                   <select v-model="editForm.membershipType" class="w-full border border-red-200 rounded p-2 bg-white text-sm">
                     <option value="Regular">Regular</option>
                     <option value="Household">Household</option>
                     <option value="Student">Student</option>
                     <option value="Junior">Junior</option>
                     <option value="Lifetime">Lifetime</option>
                     <option value="Honorary">Honorary</option>
                     <option value="Associate">Associate</option>
                   </select>
                 </div>
                 <div>
                   <label class="block text-xs font-bold text-gray-600 uppercase mb-1">System Role</label>
                   <select v-model="editForm.role" class="w-full border border-red-200 rounded p-2 bg-white text-sm">
                     <option value="member">Member</option>
                     <option value="manager">Manager</option>
                     <option value="admin">Admin</option>
                   </select>
                 </div>
               </div>
             </div>

             <div class="flex justify-end gap-3 pt-4 border-t mt-2">
                <button @click="showEditProfileModal = false" class="text-gray-500 font-bold text-sm">Cancel</button>
                <button 
                  @click="saveProfile" 
                  :disabled="savingProfile"
                  class="bg-blue-600 text-white font-bold py-2 px-6 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {{ savingProfile ? 'Saving...' : 'Save Changes' }}
                </button>
             </div>
          </div>
       </div>
    </div>

    <div v-if="showLogModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
       <div class="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
          <div class="bg-blue-600 p-4 flex justify-between items-center text-white">
             <h3 class="font-bold text-lg">{{ editingLog ? 'Edit Entry' : 'Log Volunteer Hours' }}</h3>
             <button @click="showLogModal = false" class="hover:bg-blue-700 p-1 rounded">✕</button>
          </div>
          <div class="p-6">
             <LogHoursForm 
                :user="fullProfile.id ? fullProfile : user"
                :currentUserRole="currentUserRole"
                :initialData="editingLog"
                @saved="handleLogSaved"
                @close="showLogModal = false"
                @notify="handleNotify" 
             />
          </div>
       </div>
    </div>

    <div v-if="showSignupModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
       <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div class="bg-green-600 p-4 flex justify-between items-center text-white shrink-0">
             <h3 class="font-bold text-lg">Volunteer Signup</h3>
             <button @click="showSignupModal = false" class="hover:bg-green-700 p-1 rounded">✕</button>
          </div>
          <div class="p-0 overflow-y-auto custom-scrollbar">
             <VolunteerAvailabilityForm :user="user" class="border-none shadow-none" />
          </div>
       </div>
    </div>
  </div>
</template>