import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:4000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '')
  }
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: apiProxy
  },
  preview: {
    host: '0.0.0.0',
    proxy: apiProxy
  }
});
