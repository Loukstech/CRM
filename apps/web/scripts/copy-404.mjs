import { copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'dist/index.html');
const to = resolve(root, 'dist/404.html');

await copyFile(from, to);
console.log('Fallback SPA généré : dist/404.html');
