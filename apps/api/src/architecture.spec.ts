import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SRC = __dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

const relative = (file: string) => path.relative(SRC, file).replaceAll('\\', '/');

/**
 * Règles d'architecture vérifiées automatiquement. Elles protègent l'isolation
 * multi-tenant contre les régressions introduites par les futurs modules.
 */
describe("règles d'architecture", () => {
  const files = sourceFiles(SRC);

  it('seuls database/, auth/, health/ et cli/ utilisent le client Prisma sans contexte tenant', () => {
    const allowed = [/^database\//, /^modules\/auth\//, /^modules\/health\//, /^cli\//];
    const offenders = files
      .filter((file) => /\bPrismaService\b/.test(readFileSync(file, 'utf8')))
      .map(relative)
      .filter((file) => !allowed.some((pattern) => pattern.test(file)));
    expect(offenders).toEqual([]);
  });

  it("aucun module n'instancie son propre PrismaClient", () => {
    const offenders = files
      .filter((file) => /new PrismaClient\b/.test(readFileSync(file, 'utf8')))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it("aucun DTO n'accepte organizationId du client en dehors du choix de l'organisation active", () => {
    // L'organisation vient TOUJOURS du contexte validé côté serveur. Les deux
    // seules entrées légitimes servent à désigner l'organisation à activer,
    // et l'appartenance y est vérifiée avant usage.
    const offenders = files
      .filter((file) => /\.dto\.ts$|\.controller\.ts$|\.module\.ts$/.test(file))
      // Déclaration de propriété de classe (`organizationId?: string;`), pas un littéral d'objet.
      .filter((file) => /^\s+organizationId[?!]?:\s*string;/m.test(readFileSync(file, 'utf8')))
      .map(relative);
    expect(offenders).toEqual(['modules/auth/dto/auth.dto.ts']);
  });

  it("aucune requête SQL brute n'est construite par concaténation", () => {
    const offenders = files
      .filter((file) => /\$(queryRawUnsafe|executeRawUnsafe)\b/.test(readFileSync(file, 'utf8')))
      .map(relative);
    expect(offenders).toEqual([]);
  });
});
