import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Points '@' to your 'src' directory (Very standard Vue convention)
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      
      // Points '@components' to 'src/components' (Your specific request)
      '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      
      // I highly recommend adding this one too, given your new structure:
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url))
    }
  }
})