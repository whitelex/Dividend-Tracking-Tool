import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  define: {
    'import.meta.env.VITE_PUBLIC_PASSCODE': JSON.stringify(process.env.VITE_PUBLIC_PASSCODE || ''),
  },
});