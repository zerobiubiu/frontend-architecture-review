import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 纯静态 SPA：不引入 SSR，也不依赖后端运行环境。
// 后端联调时通过 VITE_API_BASE_URL 指向 API origin，开发期默认同源相对路径。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    preserveSymlinks: true,
    dedupe: ['react', 'react-dom', 'zod', 'hono'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
});
