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
    //
    // ponytail/ is a vendored plugin that ships its own node:test suite. Vitest collected
    // its 20 files, reported every one as "No test suite found", and pushed the run's
    // environment setup past six minutes — long enough that a 5s waitFor in Overview
    // flaked. Two dozen red files and a phantom failure, none of them this app's.
    exclude: [...configDefaults.exclude, 'tests/**/*.spec.ts', 'ponytail/**'],
  },
})
