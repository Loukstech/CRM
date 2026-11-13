import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type Tx = Prisma.TransactionClient;

/**
 * Contexte d'isolation posé sur la transaction PostgreSQL et lu par les
 * policies RLS (fonctions app_current_org_id(), app_current_user_id(),
 * app_invitation_token_hash()).
 */
export interface DbScope {
  /** Organisation active, déjà validée côté serveur (membership vérifié). */
  organizationId?: string | null;
  /** Utilisateur authentifié. */
  userId?: string | null;
  /** Hash du jeton d'invitation présenté (acceptation hors contexte d'organisation). */
  invitationTokenHash?: string | null;
}

/**
 * Point d'entrée UNIQUE des modules métier vers la base.
 *
 * Chaque appel ouvre une transaction, y pose le contexte via
 * set_config(..., is_local => true) puis exécute `fn`. La portée
 * « transaction » garantit que le contexte ne survit pas au retour de la
 * connexion dans le pool.
 *
 * Défense en profondeur : les services filtrent AUSSI explicitement sur
 * organizationId ; la RLS rattrape un filtre oublié.
 *
 * Ne pas faire de travail lent (hash de mot de passe, appel réseau) dans `fn`.
 */
@Injectable()
export class TenantDb {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(scope: DbScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await applyDbScope(tx, scope);
      return fn(tx);
    });
  }
}

/** Pose (ou remplace) le contexte d'isolation sur la transaction courante. */
export async function applyDbScope(tx: Tx, scope: DbScope): Promise<void> {
  await tx.$queryRaw`
    SELECT
      set_config('app.current_org_id', ${scope.organizationId ?? ''}, true),
      set_config('app.current_user_id', ${scope.userId ?? ''}, true),
      set_config('app.invitation_token_hash', ${scope.invitationTokenHash ?? ''}, true)
  `;
}
