<script setup>
import { ref, computed } from 'vue'
import { doc, updateDoc } from "firebase/firestore"
import { db } from '../firebase'

const props = defineProps({
  targetUser: { type: Object, required: true },
  currentUserRole: String
})

const emit = defineEmits(['close', 'save'])

const formData = ref({
  firstName: props.targetUser.firstName || '',
  lastName: props.targetUser.lastName || '',
  email: props.targetUser.email || '',
  address: props.targetUser.address || '',
  city: props.targetUser.city || '',
  state: props.targetUser.state || '',
  zip: props.targetUser.zip || '',
  phone: props.targetUser.phone || '',
  joinedDate: props.targetUser.joinedDate || '',
  cellPhone: props.targetUser.cellPhone || '',
  status: props.targetUser.status || 'Active',
  adminNotes: props.targetUser.adminNotes || '',
  membershipType: props.targetUser.membershipType || 'Regular',
  role: props.targetUser.role || 'member'
})

const isAdmin = computed(() => props.currentUserRole === 'admin')

const handleSubmit = async () => {
  try {
    let userRef
    if (props.targetUser.type === 'legacy') {
      userRef = doc(db, "legacy_members", props.targetUser.realId)
    } else {
      userRef = doc(db, "members", props.targetUser.uid)
    }

    await updateDoc(userRef, formData.value)
    
    emit('save', formData.value)
    emit('close')
  } catch (err) {
    console.error(err)
    alert("Error updating profile: " + err.message)
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white p-6 rounded shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-4 border-b pb-2">
        <h2 class="text-xl font-bold">Edit Profile: {{ targetUser.email }}</h2>
        <button @click="$emit('close')" class="text-gray-500 hover:text-gray-700">✕</button>
      </div>

      <form @submit.prevent="handleSubmit" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-600">First Name</label>
          <input v-model="formData.firstName" class="w-full p-2 border rounded" required />
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-600">Last Name</label>
          <input v-model="formData.lastName" class="w-full p-2 border rounded" required />
        </div>
        
        <div class="md:col-span-2">
          <label class="block text-xs font-bold text-gray-600">Street Address</label>
          <input v-model="formData.address" class="w-full p-2 border rounded" />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-600">City</label>
          <input v-model="formData.city" class="w-full p-2 border rounded" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs font-bold text-gray-600">State</label>
            <input v-model="formData.state" class="w-full p-2 border rounded" />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-600">Zip</label>
            <input v-model="formData.zip" class="w-full p-2 border rounded" />
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-600">Home Phone</label>
          <input v-model="formData.phone" class="w-full p-2 border rounded" />
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-600">Cell Phone</label>
          <input v-model="formData.cellPhone" class="w-full p-2 border rounded" />
        </div>

        <div class="md:col-span-2 border-t pt-4 mt-2">
          <h3 class="font-bold text-sm text-gray-500 mb-2">Membership Details</h3>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-600">Joined Year</label>
          <input 
            type="number"
            placeholder="e.g. 1998"
            v-model="formData.joinedDate" 
            :disabled="!isAdmin"
            class="w-full p-2 border rounded"
            :class="!isAdmin ? 'bg-gray-100 text-gray-500' : ''" 
          />
        </div>

        <div class="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 border-b pb-4">
           <div>
             <label class="block text-xs font-bold text-gray-600">Member Status</label>
             <select 
               v-model="formData.status" 
               :disabled="!isAdmin"
               class="w-full p-2 border rounded"
               :class="!isAdmin ? 'bg-gray-100 text-gray-500' : 'bg-white'"
             >
               <option value="Active">Active</option>
               <option value="Inactive">Inactive (Resigned/Moved)</option>
               <option value="Deceased">Deceased</option>
             </select>
           </div>
           <div>
             <label class="block text-xs font-bold text-gray-600">Admin Notes</label>
             <input 
               type="text"
               placeholder="e.g. Passed away Nov 2024"
               v-model="formData.adminNotes" 
               :disabled="!isAdmin"
               class="w-full p-2 border rounded"
               :class="!isAdmin ? 'bg-gray-100 text-gray-500' : ''"
             />
           </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-600">Membership Type</label>
          <select 
            v-model="formData.membershipType" 
            :disabled="!isAdmin"
            class="w-full p-2 border rounded"
            :class="!isAdmin ? 'bg-gray-100 text-gray-500' : ''"
          >
            <option value="Regular">Regular</option>
            <option value="Applicant">Applicant</option>
            <option value="Family">Family</option>
            <option value="Associate">Associate</option>
            <option value="Lifetime">Lifetime</option>
            <option value="Junior">Junior</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-600">System Role</label>
          <select 
            v-model="formData.role" 
            :disabled="!isAdmin"
            class="w-full p-2 border rounded"
            :class="!isAdmin ? 'bg-gray-100 text-gray-500' : ''"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <p v-if="!isAdmin" class="text-[10px] text-gray-400 mt-1">Only Admins can change roles.</p>
        </div>

        <div class="md:col-span-2 flex justify-end gap-3 mt-4 border-t pt-4">
          <button type="button" @click="$emit('close')" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button type="submit" class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Changes</button>
        </div>
      </form>
    </div>
  </div>
</template>