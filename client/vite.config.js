import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5350,
    proxy: {
      '/api': {
        target: 'http://localhost:4350',
        changeOrigin: true,
      },
    },
  },
});
