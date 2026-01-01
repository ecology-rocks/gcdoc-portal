<script setup>
const props = defineProps(['activeSessions'])
const emit = defineEmits(['start-signin', 'start-signout'])
</script>

<template>
  <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8">
      
    <div class="flex flex-col gap-6 justify-center">
      <button 
        @click="$emit('start-signin')" 
        class="group relative w-full bg-green-600 hover:bg-green-500 active:bg-green-700 text-white rounded-2xl shadow-xl overflow-hidden transition-all transform active:scale-95 h-48"
      >
        <div class="absolute inset-0 flex items-center justify-center flex-col">
          <span class="text-6xl mb-2">👋</span>
          <span class="text-4xl font-black uppercase tracking-wide">Sign In</span>
          <span class="text-green-200 mt-2">Start working now</span>
        </div>
      </button>

      <div class="bg-slate-800 rounded-xl border border-slate-700 p-6 flex-1">
        <h2 class="text-slate-400 font-bold uppercase tracking-widest text-sm mb-4">Currently Signed In</h2>
        
        <div v-if="activeSessions.length === 0" class="text-center text-slate-500 py-10">
          <p class="text-xl">No one is here yet.</p>
          <p class="text-sm">Be the first!</p>
        </div>

        <div v-else class="space-y-3 overflow-y-auto max-h-[400px]">
          <div v-for="session in activeSessions" :key="session.id" class="bg-slate-700 p-4 rounded-lg flex justify-between items-center shadow">
            <div>
              <div class="font-bold text-xl text-white">{{ session.memberName }}</div>
              <div class="text-sm text-slate-400 flex items-center gap-2">
                  <span>{{ session.activity }}</span>
                  <span class="w-1 h-1 bg-slate-500 rounded-full"></span>
                  <span class="font-mono text-yellow-500">{{ new Date(session.signInTime).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) }}</span>
              </div>
            </div>
            <button 
              @click="$emit('start-signout', session)"
              class="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-3 rounded-lg shadow uppercase text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="hidden lg:flex flex-col justify-center items-center text-center p-12 bg-slate-800 bg-opacity-50 rounded-2xl border-2 border-dashed border-slate-700">
      <div class="text-8xl mb-6 opacity-20">🐕</div>
      <h2 class="text-3xl font-bold text-white mb-4">Welcome to the Club!</h2>
      <p class="text-xl text-slate-300 max-w-md">Thank you for volunteering. Your hours help keep the club running and earn you vouchers!</p>
    </div>
  </div>
</template>