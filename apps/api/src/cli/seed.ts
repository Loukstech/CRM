/**
 * Données de DÉMONSTRATION pour le développement local uniquement.
 *
 * Passe par les vrais services (inscription, provisionnement, RLS) : aucune
 * écriture directe en base. Refuse de s'exécuter en production.
 *
 *   npm run db:seed
 */
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../modules/auth/auth.service';

const DEMO_EMAIL = 'demo@crm.local';

async function main(): Promise<void> {
  if (getConfig().NODE_ENV === 'production') {
    throw new Error('Le seed de démonstration est interdit en production.');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    if (await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } })) {
      console.log(`Le compte ${DEMO_EMAIL} existe déjà : rien à faire.`);
      return;
    }

    // Mot de passe aléatoire affiché une seule fois : aucun identifiant par défaut connu.
    const password = process.env.SEED_PASSWORD ?? randomBytes(12).toString('base64url');
    const result = await app.get(AuthService).register({
      email: DEMO_EMAIL,
      password,
      name: 'Compte Démo',
      organizationName: 'Organisation Démo',
      country: 'BJ',
      currency: 'XOF',
      timezone: 'Africa/Porto-Novo',
    });
    await prisma.user.update({ where: { id: result.user.id }, data: { emailVerifiedAt: new Date() } });

    console.log('Compte de démonstration créé :');
    console.log(`  e-mail        : ${DEMO_EMAIL}`);
    console.log(`  mot de passe  : ${password}`);
    console.log(`  organisation  : ${result.organizations[0]?.name} (${result.activeOrganizationId})`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
