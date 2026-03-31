import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Initialize the database connection pool using the DATABASE_URL environment variable
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// Prisma client initialization with the pg adapter
const prisma = new PrismaClient({ adapter });

export default prisma;
