import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/main/test-setup.ts'],
    include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
    exclude: ['node_modules', 'out', 'dist'],
  },
});
