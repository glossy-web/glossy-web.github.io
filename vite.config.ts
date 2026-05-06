import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  base: '/',
  define: { 'process.env': '{}' },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'fs': resolve(__dirname, 'src/stubs/fs.ts'),
      '@ts-evtx/messages': resolve(__dirname, 'src/stubs/ts-evtx-messages.ts'),
    },
  },
  esbuild: {
    keepNames: true,
  },
  build: {
    outDir: 'docs',
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
});
