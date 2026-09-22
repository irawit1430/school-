import path from "path";
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./")
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // tests/*.spec.ts belong to Playwright (see playwright.config.ts). Without this,
    // vitest collects them, fails on the @playwright/test import, and the run is red.
    exclude: [...configDefaults.exclude, 'tests/**/*.spec.ts'],
  },
})
