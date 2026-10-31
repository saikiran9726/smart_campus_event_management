import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../env';
import * as schema from './schema';

const connectionString =
  env.DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/eventora?sslmode=disable';

const ssl =
  env.DATABASE_SSL || process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: true }
    : undefined;

const max = env.DATABASE_POOL_MAX || Number(process.env.DATABASE_POOL_MAX) || 10;

export const pool = new pg.Pool({
  connectionString,
  max,
  ssl,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });

export type DatabaseInstance = typeof db;
export type DatabaseTransaction = NodePgDatabase<typeof schema>;

/**
 * Runs a transactional operation using a dedicated PG client connection
 * with explicit BEGIN, COMMIT, and ROLLBACK lifecycle management.
 */
export async function withTx<T>(
  callback: (tx: DatabaseTransaction) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = drizzle(client, { schema });
    const result = await callback(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
