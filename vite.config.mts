import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  plugins: [
    react(),
    tsconfigPaths()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@/components': path.resolve(__dirname, 'src/renderer/components'),
      '@/services': path.resolve(__dirname, 'src/renderer/services'),
      '@/store': path.resolve(__dirname, 'src/renderer/store'),
      '@/types': path.resolve(__dirname, 'src/renderer/types'),
      '@/hooks': path.resolve(__dirname, 'src/renderer/hooks'),
      '@/lib': path.resolve(__dirname, 'src/renderer/lib'),
      '@/utils': path.resolve(__dirname, 'src/renderer/utils'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 6080,
    strictPort: true,
    allowedHosts: true,
    hmr: {
      clientPort: 443,
      protocol: 'wss',
    },
    proxy: {
      '/ollama-api': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/ollama-api/, ''),
      },
    },
  },
  base: './',
});
