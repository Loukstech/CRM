/**
 * Crée le fichier .env local à partir de .env.example en générant des secrets
 * aléatoires (jamais versionnés). Ne modifie pas un .env existant.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.env');

if (existsSync(target)) {
  console.log('.env existe déjà : aucun changement.');
  process.exit(0);
}

const secret = (bytes) => randomBytes(bytes).toString('hex');
const content = readFileSync(path.join(root, '.env.example'), 'utf8')
  .replaceAll('__GENERATED_JWT_SECRET__', secret(48))
  .replaceAll('__GENERATED_DB_OWNER_PASSWORD__', secret(16))
  .replaceAll('__GENERATED_DB_APP_PASSWORD__', secret(16));

writeFileSync(target, content, { encoding: 'utf8', flag: 'wx' });
console.log('.env créé avec des secrets générés localement.');
