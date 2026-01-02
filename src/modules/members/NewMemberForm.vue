<script setup>
import { ref } from 'vue'
import { addDoc, collection, query, where, getDocs } from "firebase/firestore"
import { db } from '@/firebase'
import NotificationToast from '@components/common/NotificationToast.vue'
const emit = defineEmits(['close', 'saved'])

const loading = ref(false)
const error = ref('')
const toast = ref({ show: false, message: '', type: 'success' })

const formData = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  membershipType: 'Regular', 
  role: 'member'
})

const handleSubmit = async () => {
  loading.value = true
  error.value = ''
  
  // Basic Validation
  if (!formData.value.email || !formData.value.firstName || !formData.value.lastName) {
    error.value = "First Name, Last Name, and Email are required."
    loading.value = false
    return
  }

  const emailKey = formData.value.email.trim().toLowerCase()

  try {


    // 2. NEW: Check Fully Registered Members
    // We must query because 'members' uses UID as the ID, not email.
    const q = query(collection(db, "members"), where("email", "==", emailKey))
    const memberSnap = await getDocs(q)

    if (!memberSnap.empty) {
      error.value = "This user is already fully registered in the system!"
      loading.value = false
      return
    }

    // 3. Create the record
await addDoc(collection(db, "members"), {
      ...formData.value,
      email: emailKey,
      createdAt: new Date(), // Changed from invitedAt to createdAt for consistency
      status: 'Active',
      isRegistered: false // Optional flag: helpful to know they haven't claimed the account via Auth yet
    })

   // SUCCESS: Show Toast instead of Alert
    toast.value = { 
      show: true, 
      message: `Success! Profile for ${formData.value.email} created.`, 
      type: 'success' 
    }

setTimeout(() => {
      emit('saved')
      emit('close')
    }, 1500)

  } catch (err) {
    console.error(err)
    error.value = "Error saving member: " + err.message
  }
  loading.value = false
}
</script>

<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      
      <div class="flex justify-between items-center p-4 border-b bg-gray-50 rounded-t">
        <h2 class="text-xl font-bold text-gray-800">Add New Member</h2>
        <button @click="$emit('close')" class="text-gray-500 hover:text-red-600 text-2xl font-bold">×</button>
      </div>

      <form @submit.prevent="handleSubmit" class="p-6">
        <p class="mb-4 text-sm text-gray-600 bg-blue-50 p-3 rounded border border-blue-100">
          <strong>Tip:</strong> Create a profile here. When the user eventually signs up or logs in with this email address, this data will be automatically attached to their account.
        </p>

        <div v-if="error" class="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm font-bold">
          {{ error }}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">First Name *</label>
            <input v-model="formData.firstName" class="w-full p-2 border rounded" required />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Last Name *</label>
            <input v-model="formData.lastName" class="w-full p-2 border rounded" required />
          </div>

          <div class="md:col-span-2">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Email Address *</label>
            <input type="email" v-model="formData.email" class="w-full p-2 border rounded" required />
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
            <input type="tel" v-model="formData.phone" class="w-full p-2 border rounded" />
          </div>
           <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Membership Type</label>
            <select v-model="formData.membershipType" class="w-full p-2 border rounded bg-white">
              <option value="Regular">Regular</option>
              <option value="Applicant">Applicant</option>
              <option value="Family">Family</option>
              <option value="Associate">Associate</option>
              <option value="Lifetime">Lifetime</option>
              <option value="Junior">Junior</option>
              <option value="Nonmember">Nonmember</option>
            </select>
          </div>

          <div class="md:col-span-2 border-t mt-2 pt-2">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Street Address</label>
            <input v-model="formData.address" class="w-full p-2 border rounded" />
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">City</label>
            <input v-model="formData.city" class="w-full p-2 border rounded" />
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">State</label>
              <input v-model="formData.state" class="w-full p-2 border rounded" />
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Zip</label>
              <input v-model="formData.zip" class="w-full p-2 border rounded" />
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-8 pt-4 border-t">
          <button 
            type="button" 
            @click="$emit('close')" 
            class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded font-bold"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            :disabled="loading"
            class="px-6 py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700 disabled:opacity-50"
          >
            {{ loading ? "Creating..." : "Create Member Profile" }}
          </button>
        </div>
      </form>
      <NotificationToast 
        v-if="toast.show" 
        :message="toast.message" 
        :type="toast.type" 
        @close="toast.show = false" 
      />
    </div>
  </div>
</template>