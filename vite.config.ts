import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    allowedHosts: [
      // NGROK_HOST_START
      "attempt-outboard-legroom.ngrok-free.dev",
      // NGROK_HOST_END
    ]
  },
  base: '/framed/',
})
