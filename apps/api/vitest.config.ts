import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Generated Prisma code, and the process entry point that only wires real services together.
      exclude: ['src/generated/**', 'src/server.ts'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      // Enforced in CI (docs/PRD.md: at least 70% API coverage). CI runs with real Redis and Postgres,
      // so the database and Redis code counts too.
      thresholds: { lines: 70, branches: 70, functions: 70, statements: 70 },
    },
  },
});
