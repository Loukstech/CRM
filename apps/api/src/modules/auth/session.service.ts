import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppError } from '../../common/errors';
import { currentRequestMeta } from '../../common/request-context';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { generateOpaqueToken, hashToken } from './crypto';

/** Contenu du jeton d'accès (JWT signé HS256, courte durée). */
export interface AccessTokenPayload {
  /** Identifiant de l'utilisateur. */
  sub: string;
  /** Identifiant de la session (révocation côté serveur). */
  sid: string;
  /** Organisation active ; revérifiée en base à chaque requête. */
  org?: string;
}

export interface TokenSet {
  accessToken: string;
  tokenType: 'Bearer';
  /** Durée de validité du jeton d'accès, en secondes. */
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export const JWT_ISSUER = 'crm-api';
export const JWT_AUDIENCE = 'crm-clients';

const invalidRefreshToken = () =>
  AppError.unauthenticated(
    'INVALID_REFRESH_TOKEN',
    'Session expirée ou invalide. Veuillez vous reconnecter.',
  );

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(
      { sid: payload.sid, ...(payload.org ? { org: payload.org } : {}) },
      {
        subject: payload.sub,
      },
    );
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(token);
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return {
        sub: payload.sub,
        sid: payload.sid,
        ...(typeof payload.org === 'string' ? { org: payload.org } : {}),
      };
    } catch {
      return null;
    }
  }

  /** Ouvre une session (durée de vie absolue) et émet la première paire de jetons. */
  async create(userId: string, activeOrganizationId: string | null): Promise<TokenSet> {
    const meta = currentRequestMeta();
    const refreshToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

    const session = await this.prisma.session.create({
      data: {
        userId,
        activeOrganizationId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt,
        refreshTokens: { create: { tokenHash: hashToken(refreshToken), expiresAt } },
      },
      select: { id: true },
    });

    return this.toTokenSet(userId, session.id, activeOrganizationId, refreshToken, expiresAt);
  }

  /**
   * Rotation du jeton de rafraîchissement (usage unique).
   * Présenter un jeton déjà utilisé est traité comme un vol : la session
   * entière est révoquée.
   */
  async rotate(refreshToken: string): Promise<{
    userId: string;
    sessionId: string;
    activeOrganizationId: string | null;
    refreshToken: string;
    expiresAt: Date;
  }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      select: {
        id: true,
        usedAt: true,
        expiresAt: true,
        session: {
          select: {
            id: true,
            userId: true,
            activeOrganizationId: true,
            expiresAt: true,
            revokedAt: true,
            user: { select: { status: true } },
          },
        },
      },
    });
    if (!stored) throw invalidRefreshToken();

    const { session } = stored;
    const now = new Date();

    if (stored.usedAt) {
      await this.reportReuse(session.id, session.userId);
      throw invalidRefreshToken();
    }
    if (
      session.revokedAt ||
      session.expiresAt <= now ||
      stored.expiresAt <= now ||
      session.user.status !== 'ACTIVE'
    ) {
      throw invalidRefreshToken();
    }

    // Prise atomique : deux rotations concurrentes ne peuvent pas réussir toutes les deux.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      await this.reportReuse(session.id, session.userId);
      throw invalidRefreshToken();
    }

    const next = generateOpaqueToken();
    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: { sessionId: session.id, tokenHash: hashToken(next), expiresAt: session.expiresAt },
      }),
      this.prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: now } }),
    ]);

    return {
      userId: session.userId,
      sessionId: session.id,
      activeOrganizationId: session.activeOrganizationId,
      refreshToken: next,
      expiresAt: session.expiresAt,
    };
  }

  async setActiveOrganization(sessionId: string, organizationId: string | null): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { activeOrganizationId: organizationId },
    });
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  async toTokenSet(
    userId: string,
    sessionId: string,
    organizationId: string | null,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
  ): Promise<TokenSet> {
    return {
      accessToken: await this.signAccessToken({
        sub: userId,
        sid: sessionId,
        ...(organizationId ? { org: organizationId } : {}),
      }),
      tokenType: 'Bearer',
      expiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    };
  }

  private async reportReuse(sessionId: string, userId: string): Promise<void> {
    await this.revoke(sessionId, 'REFRESH_TOKEN_REUSE');
    await this.audit.record(this.prisma, {
      organizationId: null,
      actorUserId: userId,
      action: 'auth.refresh_token_reuse_detected',
      entityType: 'session',
      entityId: sessionId,
    });
  }
}
