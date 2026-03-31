import path from 'node:path';
import { defineConfig } from '@prisma/config';

// Load .env so prisma migrate can access DATABASE_URL
import { config } from 'dotenv';
config({ path: path.resolve(import.meta.dirname, '.env') });

export default defineConfig({
  earlyAccess: true,
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
