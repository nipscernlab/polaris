import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: './src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/index.html'),
        splash: path.resolve(__dirname, 'src/splash.html')
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  optimizeDeps: {
    include: ['monaco-editor']
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
});