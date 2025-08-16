import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5799,
    proxy: {
      '/chat': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
  // PostCSS 配置已移至 postcss.config.js
})
