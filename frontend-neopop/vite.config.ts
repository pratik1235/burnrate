import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    alias: {
      'pdfjs-dist': 'pdfjs-dist/legacy/build/pdf.mjs',
    },
    deps: {
      optimizer: {
        web: {
          include: ['pdfjs-dist']
        }
      }
    }
  },
})
