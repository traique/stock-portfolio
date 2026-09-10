import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles:  ['src/lib/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      // Đo các file chứa logic thật (không phải barrel ai-insights.ts 18 dòng)
      // + toàn bộ lib để nhìn thấy vùng chưa được test.
      include: [
        'src/lib/calculations.ts',
        'src/lib/server/ai/*.ts',
        'src/lib/server/ai-schemas.ts',
        'src/lib/server/technical-indicators.ts',
      ],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
