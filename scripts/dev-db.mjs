/**
 * Base de développement locale : démarre un PostgreSQL embarqué persistant
 * (.data/postgres), applique les migrations et reste au premier plan.
 * Arrêt propre avec Ctrl+C.
 *
 * Lit DATABASE_URL et DATABASE_MIGRATION_URL dans .env (créé par `npm run setup`).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, migrate, startDatabase } from './lib/embedded-db.mjs';

const envPath = path.join(ROOT, '.env');
if (!existsSync(envPath)) {
  console.error("Fichier .env introuvable. Lancez d'abord : npm run setup");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [
        line.slice(0, index).trim(),
        line
          .slice(index + 1)
          .trim()
          .replace(/^"(.*)"$/, '$1'),
      ];
    }),
);

const appUrl = new URL(env.DATABASE_URL);
const migrationUrl = new URL(env.DATABASE_MIGRATION_URL);
if (appUrl.port !== migrationUrl.port || appUrl.pathname !== migrationUrl.pathname) {
  console.error('DATABASE_URL et DATABASE_MIGRATION_URL doivent viser le même serveur et la même base.');
  process.exit(1);
}

const db = await startDatabase({
  dataDir: path.join(ROOT, '.data', 'postgres'),
  port: Number(migrationUrl.port),
  database: migrationUrl.pathname.slice(1),
  superuserPassword: decodeURIComponent(migrationUrl.password),
  appPassword: decodeURIComponent(appUrl.password),
  persistent: true,
  quiet: true,
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('\nArrêt de PostgreSQL…');
  await db.stop().catch((error) => console.error(error));
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  migrate({ DATABASE_URL: env.DATABASE_URL, DATABASE_MIGRATION_URL: env.DATABASE_MIGRATION_URL });
  await db.enableAppLogin();
} catch (error) {
  console.error(error);
  await db.stop().catch(() => {});
  process.exit(1);
}

console.log(
  `\nPostgreSQL de développement prêt sur 127.0.0.1:${migrationUrl.port} (base ${migrationUrl.pathname.slice(1)}).`,
);
console.log('Migrations appliquées. Laissez ce terminal ouvert ; Ctrl+C pour arrêter.');
setInterval(() => {}, 1 << 30);
