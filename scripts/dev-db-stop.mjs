/** Arrête le PostgreSQL de développement (équivalent de Ctrl+C dans `npm run db:start`). */
import path from 'node:path';
import { ROOT, stopDatabase } from './lib/embedded-db.mjs';

try {
  await stopDatabase(path.join(ROOT, '.data', 'postgres'));
} catch {
  console.error("PostgreSQL de développement n'était pas démarré.");
  process.exitCode = 1;
}
