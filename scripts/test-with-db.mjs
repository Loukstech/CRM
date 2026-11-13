/**
 * Lance la suite de tests de l'API contre un PostgreSQL embarqué jetable :
 * cluster temporaire -> migrations -> catalogue de permissions -> Jest -> arrêt.
 *
 * Les arguments supplémentaires sont transmis à Jest :
 *   npm test -- tenant-isolation
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, migrate, startDatabase } from './lib/embedded-db.mjs';

const port = Number(process.env.TEST_DB_PORT ?? 54331);
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'crm-test-pg-'));

let exitCode = 1;
let db;
try {
  db = await startDatabase({
    dataDir: path.join(dataDir, 'data'),
    port,
    database: 'crm_test',
    superuserPassword: randomBytes(12).toString('hex'),
    appPassword: randomBytes(12).toString('hex'),
    persistent: false,
    quiet: true,
  });

  const env = {
    NODE_ENV: 'test',
    DATABASE_URL: db.appUrl,
    DATABASE_MIGRATION_URL: db.migrationUrl,
    JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
    // Limite volontairement haute : le test dédié la redéfinit localement.
    AUTH_RATE_LIMIT_MAX: '100000',
  };

  migrate(env);
  await db.enableAppLogin();

  const apiDir = path.join(ROOT, 'apps', 'api');
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      '--disable-warning=ExperimentalWarning',
      path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js'),
      '--runInBand',
      ...process.argv.slice(2),
    ],
    { cwd: apiDir, env: { ...process.env, ...env }, stdio: 'inherit' },
  );
  exitCode = result.status ?? 1;
} catch (error) {
  console.error(error);
} finally {
  if (db) await db.stop().catch((error) => console.error(error));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exitCode = exitCode;
