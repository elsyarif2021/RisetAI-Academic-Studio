import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
    target: ['chrome87', 'edge88', 'firefox78', 'safari14'],
  },
});
