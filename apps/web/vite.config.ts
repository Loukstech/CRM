import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, /api est proxifié vers l'API en ligne : pas besoin d'ouvrir
// CORS_ORIGINS à localhost, et on travaille contre les vraies données.
// En production, VITE_API_BASE_URL peut pointer vers une autre origine.
const target = process.env.VITE_API_TARGET ?? 'https://crm.timestradinginter.com';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
