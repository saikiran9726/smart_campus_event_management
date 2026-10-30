import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';
import * as schema from './schema';

dotenv.config({ path: '../../.env' });
dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/eventora?sslmode=disable';

export const pool = new pg.Pool({
  connectionString,
  max: 20,
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
