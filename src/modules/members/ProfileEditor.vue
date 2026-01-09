<script setup>
import { ref, onMounted, computed } from 'vue'
import { doc, updateDoc } from "firebase/firestore"
import { db } from '@/firebase'

const props = defineProps({
  targetUser: {
    type: Object,
    required: true
  },
  currentUserRole: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'save'])

const formData = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  // Administrative Fields
  membershipType: 'Regular',
  role: 'member',
  status: 'Active'
})

const loading = ref(false)

// PERMISSIONS
const isAdmin = computed(() => props.currentUserRole === 'admin')
const isManager = computed(() => props.currentUserRole === 'manager')
const isStaff = computed(() => isAdmin.value || isManager.value)

onMounted(() => {
  // Clone data so we don't mutate the prop directly
  formData.value = { ...props.targetUser }
})

const handleSave = async () => {
  loading.value = true
  try {
    const userRef = doc(db, "members", props.targetUser.uid)
    
    // Create update object
    const updateData = {
      firstName: formData.value.firstName,
      lastName: formData.value.lastName,
      email: formData.value.email,
      phone: formData.value.phone || '',
      address: formData.value.address || '',
      city: formData.value.city || '',
      state: formData.value.state || '',
      zip: formData.value.zip || '',
    }

    // ONLY ADMINS can write these fields to the database
    // If a Manager somehow enabled the fields, this check adds a layer of safety (UI logic)
    if (isAdmin.value) {
      updateData.membershipType = formData.value.membershipType
      updateData.role = formData.value.role
      updateData.status = formData.value.status
    }

    await updateDoc(userRef, updateData)
    
    emit('save', updateData)
    emit('close')
    alert("Profile updated successfully.")
  } catch (err) {
    console.error("Error updating profile:", err)
    alert("Failed to update profile: " + err.message)
  }
  loading.value = false
}
</script>

<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      
      <div class="p-6 border-b flex justify-between items-center bg-gray-50">
        <h3 class="text-xl font-bold text-gray-800">Edit Profile: {{ formData.firstName }} {{ formData.lastName }}</h3>
        <button @click="$emit('close')" class="text-gray-500 hover:text-red-600 text-2xl font-bold">&times;</button>
      </div>

      <form @submit.prevent="handleSave" class="p-6 space-y-6">
        
        <div>
          <h4 class="text-sm font-bold text-gray-500 uppercase border-b pb-1 mb-3">Contact Information</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-gray-700 mb-1">First Name</label>
              <input v-model="formData.firstName" class="w-full p-2 border rounded" required />
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-700 mb-1">Last Name</label>
              <input v-model="formData.lastName" class="w-full p-2 border rounded" required />
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-700 mb-1">Email</label>
              <input v-model="formData.email" type="email" class="w-full p-2 border rounded" required />
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-700 mb-1">Phone</label>
              <input v-model="formData.phone" class="w-full p-2 border rounded" />
            </div>
          </div>
        </div>

        <div>
          <h4 class="text-sm font-bold text-gray-500 uppercase border-b pb-1 mb-3">Address</h4>
          <div class="space-y-3">
             <div>
              <label class="block text-xs font-bold text-gray-700 mb-1">Street Address</label>
              <input v-model="formData.address" class="w-full p-2 border rounded" />
            </div>
            <div class="grid grid-cols-3 gap-4">
              <div class="col-span-1">
                <label class="block text-xs font-bold text-gray-700 mb-1">City</label>
                <input v-model="formData.city" class="w-full p-2 border rounded" />
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-700 mb-1">State</label>
                <input v-model="formData.state" class="w-full p-2 border rounded" />
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-700 mb-1">Zip</label>
                <input v-model="formData.zip" class="w-full p-2 border rounded" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="isStaff" class="bg-blue-50 p-4 rounded border border-blue-200">
          <div class="flex justify-between items-center border-b border-blue-200 pb-2 mb-3">
            <h4 class="text-sm font-bold text-blue-900 uppercase">Membership Status</h4>
            <span v-if="!isAdmin" class="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded flex items-center gap-1">
              🔒 View Only (Admin Required)
            </span>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div>
              <label class="block text-xs font-bold text-blue-800 mb-1">Status</label>
              <select 
                v-model="formData.status" 
                class="w-full p-2 border rounded bg-white disabled:bg-gray-100 disabled:text-gray-500"
                :disabled="!isAdmin"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-blue-800 mb-1">Type</label>
              <select 
                v-model="formData.membershipType" 
                class="w-full p-2 border rounded bg-white disabled:bg-gray-100 disabled:text-gray-500"
                :disabled="!isAdmin"
              >
                <option value="Regular">Regular</option>
                <option value="Household">Household</option>
                <option value="Applicant">Applicant</option>
                <option value="Associate">Associate</option>
                <option value="Life">Lifetime</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-blue-800 mb-1">System Role</label>
              <select 
                v-model="formData.role" 
                class="w-full p-2 border rounded bg-white disabled:bg-gray-100 disabled:text-gray-500"
                :disabled="!isAdmin"
              >
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>

          </div>
        </div>

        <div class="flex justify-end pt-4 border-t gap-3">
          <button type="button" @click="$emit('close')" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button type="submit" class="px-6 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 shadow" :disabled="loading">
            {{ loading ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>

      </form>
    </div>
  </div>
</template>