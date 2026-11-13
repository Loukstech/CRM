/**
 * PostgreSQL embarqué (binaires officiels via le paquet `embedded-postgres`).
 *
 * Sert au développement local et aux tests quand ni Docker ni PostgreSQL ne
 * sont installés. C'est un VRAI serveur PostgreSQL : la Row Level Security et
 * les rôles se comportent comme en production. Ce n'est PAS destiné à la
 * production.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import pgClient from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SUPERUSER = 'postgres';
const APP_ROLE = 'crm_app';

/**
 * Démarre un cluster, crée la base si besoin et renvoie les URL de connexion.
 * @param {{ dataDir: string, port: number, database: string, superuserPassword: string,
 *           appPassword: string, persistent: boolean, quiet?: boolean }} options
 */
export async function startDatabase(options) {
  const { dataDir, port, database, superuserPassword, appPassword, persistent, quiet } = options;
  const log = quiet ? () => {} : (message) => console.log(String(message).trimEnd());

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: SUPERUSER,
    password: superuserPassword,
    port,
    persistent,
    // UTF-8 imposé (sous Windows, initdb choisirait WIN1252) + collations ICU.
    initdbFlags: ['--encoding=UTF8', '--locale=C', '--locale-provider=icu', '--icu-locale=und'],
    onLog: log,
    onError: (message) => console.error(String(message).trimEnd()),
  });

  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    await pg.initialise();
  }

  // Démarrage via pg_ctl plutôt que pg.start() : sous Windows, postgres.exe
  // refuse de tourner dans une session administrateur, alors que pg_ctl se
  // relance lui-même avec un jeton restreint.
  const pgCtl = await resolvePgCtl();
  const logFile = path.join(dataDir, '..', 'postgres.log');
  execFileSync(
    pgCtl,
    ['start', '-D', dataDir, '-w', '-l', logFile, '-o', `-p ${port} -c listen_addresses=127.0.0.1`],
    // 'ignore' obligatoire : le serveur hériterait sinon des descripteurs et bloquerait l'appel.
    { stdio: 'ignore' },
  );
  const stop = async () => {
    execFileSync(pgCtl, ['stop', '-D', dataDir, '-m', 'fast', '-w'], { stdio: 'ignore' });
  };

  const connect = async (db) => {
    const client = new pgClient.Client({
      host: '127.0.0.1',
      port,
      user: SUPERUSER,
      password: superuserPassword,
      database: db,
    });
    await client.connect();
    return client;
  };

  try {
    const admin = await connect('postgres');
    try {
      const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
      if (rowCount === 0) await admin.query(`CREATE DATABASE "${database}"`);
    } finally {
      await admin.end();
    }
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  }

  const enc = encodeURIComponent;
  const migrationUrl = `postgresql://${SUPERUSER}:${enc(superuserPassword)}@127.0.0.1:${port}/${database}`;
  const appUrl = `postgresql://${APP_ROLE}:${enc(appPassword)}@127.0.0.1:${port}/${database}`;

  return {
    migrationUrl,
    appUrl,
    /** Donne LOGIN + mot de passe au rôle applicatif (créé sans LOGIN par la migration). */
    async enableAppLogin() {
      const client = await connect(database);
      try {
        // Pas de paramètre lié possible dans ALTER ROLE : on échappe le littéral.
        const literal = `'${appPassword.replaceAll("'", "''")}'`;
        await client.query(`ALTER ROLE ${APP_ROLE} LOGIN PASSWORD ${literal}`);
      } finally {
        await client.end();
      }
    },
    stop,
  };
}

async function resolvePgCtl() {
  const platform = { win32: 'windows', linux: 'linux', darwin: 'darwin' }[process.platform];
  if (!platform) throw new Error(`Plateforme non prise en charge : ${process.platform}`);
  const binaries = await import(`@embedded-postgres/${platform}-${process.arch}`);
  return binaries.pg_ctl;
}

/** Applique les migrations Prisma puis synchronise le catalogue de permissions. */
export function migrate(env) {
  const fullEnv = { ...process.env, ...env };
  runNode([path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], fullEnv);
  runNode(
    [
      path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      path.join(ROOT, 'prisma', 'sync-permissions.ts'),
    ],
    fullEnv,
  );
}

export function runNode(args, env, cwd = ROOT) {
  execFileSync(process.execPath, args, { cwd, env, stdio: 'inherit' });
}

/** Arrête un cluster démarré par startDatabase (utile si le terminal a été fermé). */
export async function stopDatabase(dataDir) {
  const pgCtl = await resolvePgCtl();
  execFileSync(pgCtl, ['stop', '-D', dataDir, '-m', 'fast', '-w'], { stdio: 'inherit' });
}
