import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit/component checks only: no browser, network, or legacy testing-library setup.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  test: {
    environment: 'jsdom',
    include: ['tests/student-*.test.ts', 'tests/students-*.test.tsx', 'components/views/__tests__/StudentsAttendance.test.tsx'],
  },
});
