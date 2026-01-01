<script setup>
import { ref } from 'vue'
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail 
} from "firebase/auth"
import { auth } from '../../firebase'

const email = ref('')
const password = ref('')
const isRegistering = ref(false)
const isResetting = ref(false)
const error = ref('')
const message = ref('')

const handleSubmit = async () => {
  error.value = ''
  message.value = ''

  try {
    if (isResetting.value) {
      await sendPasswordResetEmail(auth, email.value)
      message.value = "Check your email! We sent you a password reset link."
      isResetting.value = false
    } else if (isRegistering.value) {
      await createUserWithEmailAndPassword(auth, email.value, password.value)
    } else {
      await signInWithEmailAndPassword(auth, email.value, password.value)
    }
  } catch (err) {
    let msg = err.message
    if (msg.includes("user-not-found")) msg = "No account found with this email."
    if (msg.includes("wrong-password")) msg = "Incorrect password."
    if (msg.includes("email-already-in-use")) msg = "That email is already registered."
    error.value = msg
  }
}

const toggleMode = () => {
  isRegistering.value = !isRegistering.value
  isResetting.value = false
  error.value = ''
  message.value = ''
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100 p-4">
    <form @submit.prevent="handleSubmit" class="bg-white p-8 rounded shadow-md w-full max-w-md">
      <h2 class="text-2xl mb-6 font-bold text-gray-800 text-center">
        {{ isResetting ? "Reset Password" : (isRegistering ? "Register Member" : "Member Login") }}
      </h2>

      <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{{ error }}</div>
      <div v-if="message" class="bg-green-50 text-green-600 p-3 rounded mb-4 text-sm">{{ message }}</div>

      <div class="mb-4">
        <label class="block text-xs font-bold text-gray-600 mb-1">Email Address</label>
        <input
          type="email"
          required
          class="w-full p-2 border rounded focus:border-blue-500 outline-none"
          v-model="email"
        />
      </div>

      <div v-if="!isResetting" class="mb-6">
        <div class="flex justify-between">
          <label class="block text-xs font-bold text-gray-600 mb-1">Password</label>
        </div>
        <input
          type="password"
          required
          class="w-full p-2 border rounded focus:border-blue-500 outline-none"
          v-model="password"
        />
      </div>

      <button type="submit" class="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 font-bold transition-colors">
        {{ isResetting ? "Send Reset Link" : (isRegistering ? "Sign Up" : "Log In") }}
      </button>
      
      <div class="mt-4 text-center space-y-2">
        <button 
          v-if="!isResetting"
          type="button" 
          @click="isResetting = true"
          class="text-sm text-blue-600 hover:underline block w-full"
        >
          Forgot Password?
        </button>
        
        <button 
          type="button" 
          @click="toggleMode"
          class="text-sm text-gray-500 hover:text-gray-800 hover:underline"
        >
          {{ isResetting ? "Back to Login" : (isRegistering ? "Already have an account? Log In" : "Need an account? Register") }}
        </button>
      </div>
    </form>
  </div>
</template>