/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative Pfade: läuft unter https://<user>.github.io/Frank/ und lokal gleichermassen
  base: './',
  plugins: [react(), tailwindcss()],
  // Steuerdaten und Postleitzahlen aller Gemeinden (~200 kB gzip) machen das Bundle gross, das ist gewollt (offline nutzbar)
  build: { chunkSizeWarningLimit: 1100 },
  test: { include: ['tests/**/*.test.ts'] },
});
