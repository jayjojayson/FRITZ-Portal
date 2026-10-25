import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

// Version zentral aus package.json – vorher stand sie hart in App.tsx, Header.tsx und
// System.tsx und wurde beim Release leicht vergessen (Header zeigte in 1.4.6 noch 1.4.5)
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  // base: './' → alle Assets werden relativ verlinkt
  // → Pflicht für HA Ingress (absoluter Pfad würde am Ingress-Proxy vorbeigehen)
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3003',
    },
  },
})
