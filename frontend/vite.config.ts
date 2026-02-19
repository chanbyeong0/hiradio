import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envDir: '..', // cursor_hackathon 루트의 .env 로드 (VITE_* 변수)
  server: {
    host: '0.0.0.0', // 도커 컨테이너에서 외부 접근 허용
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:9100',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
