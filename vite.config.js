import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The clinician dashboards are served at /clinical/ by the Worker.
export default defineConfig({
  root: 'clinical',
  base: '/clinical/',
  publicDir: false,
  plugins: [react()],
  build: { outDir: '../dist/clinical', emptyOutDir: true },
});
