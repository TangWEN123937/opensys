import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // 代理后端 API（开发阶段）
    proxy: {
      '/api': {
        target: 'http://localhost:8010',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/ws': {
        target: 'ws://localhost:8010',
        ws: true,
        changeOrigin: true,
      },
      // noVNC 远程桌面代理（浏览器实时画面）
      '/novnc': {
        target: 'http://localhost:6080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/novnc/, ''),
        ws: true,
      },
    },
  },
})
