import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    typecheck: {
      enabled: true,
      include: ['tests/types/**/*.test-d.ts'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/types.ts', 'src/**/index.ts'],
    },
  },
});
