import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        landing: resolve(root, 'index.html'),
        lisboa: resolve(root, 'maps/lisboa/index.html'),
      },
    },
  },
  server: {
    host: true,
  },
})
