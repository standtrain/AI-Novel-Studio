import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // 将稳定依赖拆成独立缓存块，降低业务主包体积并提升二次加载命中率
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom', 'zustand'],
          antd: ['antd'],
          icons: ['@ant-design/icons'],
          http: ['axios'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
