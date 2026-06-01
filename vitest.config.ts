import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles:  ['src/lib/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/calculations.ts', 'src/lib/server/ai-insights.ts'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
