#!/usr/bin/env node
/**
 * KAPWA Hospitality OS — Neon PostgreSQL Schema & Permissions Migration Runner
 *
 * Usage:
 *   DATABASE_URL="postgresql://user:pass@ep-xyz.region.aws.neon.tech/neondb?sslmode=require" npm run db:migrate
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!connectionString) {
    console.error('Error: DATABASE_URL (or NEON_DATABASE_URL) environment variable is required to run migrations against Neon PostgreSQL.');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    console.log('[kapwa-db] Applying Neon PostgreSQL schema (db/schema.sql)...');
    const schemaSql = await readFile(join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schemaSql);

    console.log('[kapwa-db] Applying database permission helpers (db/permissions.sql)...');
    const permissionsSql = await readFile(join(__dirname, 'permissions.sql'), 'utf8');
    await client.query(permissionsSql);

    console.log('[kapwa-db] Migration completed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[kapwa-db] Migration failed:', err.message || err);
  process.exit(1);
});
