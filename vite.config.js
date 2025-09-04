import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      // Quando il modulo "xlsx" viene richiesto, sostituiscilo con il file xlsx.js
      { find: /^xlsx$/, replacement: path.resolve(__dirname, 'node_modules/xlsx-style/xlsx.js') },
      // Quando viene richiesto "./cptable", usalo dal percorso specificato
      { find: /^\.\/cptable$/, replacement: path.resolve(__dirname, 'node_modules/xlsx-style/dist/cptable.js') }
    ]
  },
  optimizeDeps: {
    // Escludi xlsx-style dall'ottimizzazione automatica
    exclude: ['xlsx-style']
  },
  server: {
    host: true, // Ascolta su tutti gli IP (necessario per accedere da rete)
    port: 5173  // Puoi mantenere la porta attuale oppure cambiarla
  }
});
