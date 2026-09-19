import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone browser preview of the actual component with local in-memory data.
// No authentication or requests to the live backend are used.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    { find: '@/lib/api', replacement: path.resolve(import.meta.dirname, 'tests/fixtures/drivers-api.ts') },
    { find: 'next/link', replacement: path.resolve(import.meta.dirname, 'tests/fixtures/preview-link.tsx') },
    { find: '@', replacement: path.resolve(import.meta.dirname, '.') },
  ] },
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
});
