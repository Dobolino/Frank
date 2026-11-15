/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative Pfade: läuft unter https://<user>.github.io/Frank/ und lokal gleichermassen
  base: './',
  plugins: [react(), tailwindcss()],
  test: { include: ['tests/**/*.test.ts'] },
});
