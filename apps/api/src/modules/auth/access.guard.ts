import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ACCESS_POLICY,
  type AccessPolicy,
  type AuthUser,
  type AuthenticatedRequest,
} from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { MembershipAccessService } from './membership-access.service';
import { SessionService } from './session.service';

/**
 * Garde global unique : authentification -> contexte tenant -> permissions.
 *
 * REFUS PAR DÉFAUT : une route qui ne déclare ni @Public(), ni @UserScoped(),
 * ni @RequirePermissions(...) est rejetée.
 *
 * Rien n'est mis en cache : session, statut du compte, appartenance et
 * permissions sont relus en base à chaque requête. Une révocation ou un
 * changement de rôle prend donc effet immédiatement, sans attendre
 * l'expiration du jeton d'accès.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly access: MembershipAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!policy) {
      this.logger.error(
        `Route sans politique d'accès : ${context.getClass().name}.${context.getHandler().name}`,
      );
      throw AppError.forbidden('ACCESS_POLICY_MISSING', 'Accès refusé.');
    }
    if (policy.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = await this.authenticate(request);
    request.auth = auth;

    if (policy.kind === 'user') return true;

    if (!auth.tenant) {
      throw AppError.forbidden(
        'NO_ACTIVE_ORGANIZATION',
        'Aucune organisation active : sélectionnez une organisation dont vous êtes membre.',
      );
    }
    const granted = auth.tenant.permissions;
    const missing = policy.permissions.filter((key) => !granted.has(key));
    if (missing.length > 0) {
      throw AppError.forbidden('PERMISSION_DENIED', 'Permission insuffisante pour cette action.');
    }
    return true;
  }

  private async authenticate(request: AuthenticatedRequest): Promise<AuthUser> {
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) throw AppError.unauthenticated();

    const payload = await this.sessions.verifyAccessToken(token);
    if (!payload) throw AppError.unauthenticated('INVALID_TOKEN', "Jeton d'accès invalide ou expiré.");

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { status: true, emailVerifiedAt: true } },
      },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw AppError.unauthenticated('SESSION_REVOKED', 'Session expirée ou révoquée.');
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      emailVerified: session.user.emailVerifiedAt !== null,
      // L'organisation du jeton n'est acceptée que si l'appartenance est toujours valide.
      tenant: payload.org ? await this.access.load(payload.sub, payload.org) : null,
    };
  }
}
