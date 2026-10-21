import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./', import.meta.url))
export default defineConfig({
  root,
  publicDir: '../../public',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
      'next/link': fileURLToPath(new URL('./link.tsx', import.meta.url)),
      'next/image': fileURLToPath(new URL('./image.tsx', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: ['.e2b.app', 'localhost'],
    fs: { allow: ['../..'] },
  },
})
