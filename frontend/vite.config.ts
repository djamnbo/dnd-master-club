import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // 🚨 중요: localhost 대신 127.0.0.1 사용 (IPv4 강제)
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        secure: false,
        // 🚨 중요: 디버깅을 위해 프록시 로그 활성화
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('❌ proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('POST sending to Ollama:', req.method, req.url, '->', 'http://127.0.0.1:11434' + proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('✅ received response from Ollama:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
});