// vite.config.js
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^xlsx$/,       replacement: path.resolve(__dirname, 'node_modules/xlsx-style/xlsx.js') },
      { find: /^\.\/cptable$/,replacement: path.resolve(__dirname, 'node_modules/xlsx-style/dist/cptable.js') },
      { find: /^cptable$/,    replacement: path.resolve(__dirname, 'node_modules/xlsx-style/dist/cptable.js') }
    ]
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://192.168.1.250:3001',
        changeOrigin: true,
        secure: false
        // ← **rimuovi** il rewrite se il tuo backend è già `/api/...`
        // rewrite: (path) => path.replace(/^\/api/, ''),
      }
    }
  },
  optimizeDeps: {
    exclude: ['xlsx-style']
  }
})
