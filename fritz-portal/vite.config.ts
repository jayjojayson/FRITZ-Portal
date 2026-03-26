import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // base: './' — alle Assets werden relativ verlinkt
  // Pflicht für HA Ingress (absoluter Pfad würde am Ingress-Proxy vorbeigehen)
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3003',
    },
  },
})
