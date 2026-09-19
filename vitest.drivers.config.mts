import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Focused regression suite; does not depend on the legacy testing-library setup.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  test: { environment: 'jsdom', include: ['tests/drivers-ui.test.tsx'] },
});
