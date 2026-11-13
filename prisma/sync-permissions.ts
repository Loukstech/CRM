/**
 * Synchronise la table `permissions` avec le catalogue défini dans le code.
 *
 * Exécuté avec le rôle de MIGRATION (DATABASE_MIGRATION_URL) : le rôle
 * applicatif n'a qu'un accès en lecture au catalogue.
 *
 * - ajoute / met à jour les permissions du catalogue ;
 * - supprime celles qui n'y figurent plus (cascade sur role_permissions).
 */
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../apps/api/src/modules/permissions/permission-catalog';

async function main(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL est requis pour synchroniser les permissions.');

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const keys = PERMISSIONS.map((p) => p.key);
    const [removed] = await prisma.$transaction([
      prisma.permission.deleteMany({ where: { key: { notIn: keys } } }),
      ...PERMISSIONS.map((p) =>
        prisma.permission.upsert({
          where: { key: p.key },
          create: { key: p.key, description: p.description, scoped: p.scoped },
          update: { description: p.description, scoped: p.scoped },
        }),
      ),
    ]);
    console.log(
      `Permissions synchronisées : ${keys.length} dans le catalogue, ${removed.count} supprimée(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
