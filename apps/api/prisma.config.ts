import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read .env by itself. In CI and on hosts DATABASE_URL is a real env var.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the environment.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
