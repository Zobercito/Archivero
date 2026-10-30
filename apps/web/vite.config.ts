import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  const port = Number(process.env.WEB_PORT ?? (demo ? 5174 : 5173));

  return {
    base: demo ? (process.env.DEMO_BASE ?? '/') : '/',
    plugins: [react(), tailwindcss()],
    server: {
      port,
      strictPort: true,
      proxy: demo
        ? undefined
        : {
            '/api': {
              target: apiTarget,
              changeOrigin: false,
            },
          },
    },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      sourcemap: true,
    },
  };
});
