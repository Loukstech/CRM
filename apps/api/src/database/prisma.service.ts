import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/env';

/**
 * Client Prisma brut — NE PAS injecter dans les modules métier.
 *
 * Il ne pose aucun contexte tenant : sous RLS, les tables d'organisation ne
 * renvoient donc aucune ligne. Son usage est réservé :
 *   - au module auth, pour les tables d'identité globales (users, sessions,
 *     refresh_tokens, user_tokens) ;
 *   - à TenantDb, qui ouvre les transactions avec contexte ;
 *   - au contrôle de santé.
 * Le test architecture.spec.ts vérifie cette règle.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ datasourceUrl: config.DATABASE_URL });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.assertUnprivilegedRole();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Garde-fou : un superutilisateur ou un rôle BYPASSRLS contourne toutes les
   * policies. On refuse de démarrer plutôt que de tourner sans défense en
   * profondeur.
   */
  private async assertUnprivilegedRole(): Promise<void> {
    const rows = await this.$queryRaw<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    const role = rows[0];
    if (!role || role.rolsuper || role.rolbypassrls) {
      throw new Error(
        `DATABASE_URL utilise le rôle « ${role?.rolname ?? 'inconnu'} » qui contourne la Row Level Security. ` +
          "L'API doit se connecter avec un rôle sans privilège (crm_app).",
      );
    }
    this.logger.log(`Connecté à PostgreSQL avec le rôle « ${role.rolname} » (soumis à la RLS).`);
  }
}
