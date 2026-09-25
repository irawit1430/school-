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
    // tests/*.spec.ts belong to Playwright (see playwright.config.ts). Only browser
    // specs live there now — the nine pure-logic files that used to import
    // @playwright/test are ordinary *.test.ts, because npm run test:e2e needs browsers
    // and so CI never ran them: 51 unit tests were checking nothing on every push.
    //
    // ponytail/ is a vendored plugin that ships its own node:test suite. Vitest collected
    // its 20 files, reported every one as "No test suite found", and pushed the run's
    // environment setup past six minutes — long enough that a 5s waitFor in Overview
    // flaked. Two dozen red files and a phantom failure, none of them this app's.
    exclude: [...configDefaults.exclude, 'tests/**/*.spec.ts', 'ponytail/**'],
  },
})
