import { defineConfig } from 'vitest/config';

// Small logic tests that do not require React Testing Library or a browser DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
