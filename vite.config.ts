import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/bunnybrawl/',
  optimizeDeps: {
    include: ['@trystero-p2p/mqtt'],
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
