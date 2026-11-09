import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distMigrate = path.resolve(__dirname, '../dist/db/migrate.js');

if (fs.existsSync(distMigrate)) {
  const mod = await import(pathToFileURL(distMigrate).href);
  if (typeof mod.runMigrations === 'function') {
    await mod.runMigrations();
    const { pool } = await import(pathToFileURL(path.resolve(__dirname, '../dist/db/client.js')).href);
    await pool.end();
  }
} else {
  const result = spawnSync('npx', ['tsx', 'src/db/migrate.ts'], {
    stdio: 'inherit',
    shell: true,
    cwd: path.resolve(__dirname, '..'),
  });
  process.exit(result.status ?? 0);
}
