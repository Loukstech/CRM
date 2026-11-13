import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { UserTokenType } from '@prisma/client';
import type { AuthUser } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { isUniqueViolation } from '../../common/validators';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { PrismaService } from '../../database/prisma.service';
import { TenantDb } from '../../database/tenant-db.service';
import { AuditService } from '../audit/audit.service';
import { Mailer } from '../mail/mail.module';
import { OrganizationProvisioner } from '../organizations/organization-provisioner';
import { PasswordService, generateOpaqueToken, hashToken, normalizeEmail } from './crypto';
import type {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  SwitchOrganizationDto,
} from './dto/auth.dto';
import { MembershipAccessService } from './membership-access.service';
import { SessionService } from './session.service';

const EMAIL_VERIFICATION_TTL_MS = 48 * 3_600_000;
const PASSWORD_RESET_TTL_MS = 3_600_000;

const invalidCredentials = () =>
  AppError.unauthenticated('INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect.');
const invalidToken = () => AppError.badRequest('INVALID_TOKEN', 'Lien invalide ou expiré.');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly access: MembershipAccessService,
    private readonly provisioner: OrganizationProvisioner,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Crée le compte, sa première organisation (dont il est propriétaire) et ouvre une session. */
  async register(dto: RegisterDto) {
    const email = normalizeEmail(dto.email);
    const passwordHash = await this.passwords.hash(dto.password);
    const userId = randomUUID();
    const verificationToken = generateOpaqueToken();

    let organizationId: string;
    try {
      organizationId = await this.db.run({ userId }, async (tx) => {
        await tx.user.create({ data: { id: userId, email, name: dto.name, passwordHash } });
        const { organization } = await this.provisioner.provision(tx, userId, {
          name: dto.organizationName,
          country: dto.country,
          currency: dto.currency,
          timezone: dto.timezone,
        });
        await tx.userToken.create({
          data: {
            userId,
            type: 'EMAIL_VERIFICATION',
            tokenHash: hashToken(verificationToken),
            expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
          },
        });
        await this.audit.record(tx, {
          organizationId: null,
          actorUserId: userId,
          action: 'user.registered',
          entityType: 'user',
          entityId: userId,
        });
        return organization.id;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'User')) {
        throw AppError.conflict('EMAIL_ALREADY_REGISTERED', 'Un compte existe déjà avec cet e-mail.');
      }
      throw error;
    }

    await this.sendVerificationEmail(email, verificationToken);
    return this.openSession(userId, organizationId);
  }

  async login(dto: LoginDto) {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      await this.passwords.verifyDummy(dto.password);
      await this.audit.record(this.prisma, {
        organizationId: null,
        actorUserId: null,
        action: 'auth.login_failed',
        entityType: 'user',
        metadata: { reason: 'unknown_account' },
      });
      throw invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        'ACCOUNT_LOCKED',
        'Compte temporairement verrouillé après plusieurs échecs. Réessayez plus tard.',
      );
    }

    if (!(await this.passwords.verify(user.passwordHash, dto.password))) {
      await this.registerFailedLogin(user.id);
      throw invalidCredentials();
    }
    if (user.status !== 'ACTIVE') {
      throw AppError.forbidden('ACCOUNT_DISABLED', 'Ce compte est désactivé.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.audit.record(this.prisma, {
      organizationId: null,
      actorUserId: user.id,
      action: 'auth.login_succeeded',
      entityType: 'user',
      entityId: user.id,
    });

    return this.openSession(user.id, dto.organizationId);
  }

  async refresh(refreshToken: string) {
    const rotated = await this.sessions.rotate(refreshToken);

    // L'organisation mémorisée n'est reconduite que si l'appartenance est toujours valide.
    let organizationId = rotated.activeOrganizationId;
    if (organizationId && !(await this.access.load(rotated.userId, organizationId))) {
      organizationId = null;
      await this.sessions.setActiveOrganization(rotated.sessionId, null);
    }

    return {
      tokens: await this.sessions.toTokenSet(
        rotated.userId,
        rotated.sessionId,
        organizationId,
        rotated.refreshToken,
        rotated.expiresAt,
      ),
      activeOrganizationId: organizationId,
    };
  }

  async logout(auth: AuthUser): Promise<void> {
    await this.sessions.revoke(auth.sessionId, 'LOGOUT');
    await this.audit.record(this.prisma, {
      organizationId: null,
      actorUserId: auth.userId,
      action: 'auth.logout',
      entityType: 'session',
      entityId: auth.sessionId,
    });
  }

  /** Change l'organisation active après vérification de l'appartenance côté serveur. */
  async switchOrganization(auth: AuthUser, dto: SwitchOrganizationDto) {
    const tenant = await this.access.load(auth.userId, dto.organizationId);
    if (!tenant) {
      // Même réponse que l'organisation existe ou non : aucune fuite d'existence.
      throw AppError.forbidden('NOT_A_MEMBER', "Vous n'êtes pas membre actif de cette organisation.");
    }
    await this.sessions.setActiveOrganization(auth.sessionId, dto.organizationId);
    return {
      accessToken: await this.sessions.signAccessToken({
        sub: auth.userId,
        sid: auth.sessionId,
        org: dto.organizationId,
      }),
      tokenType: 'Bearer' as const,
      expiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
      activeOrganizationId: dto.organizationId,
    };
  }

  async me(auth: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { id: true, email: true, name: true, locale: true, avatarUrl: true, emailVerifiedAt: true },
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerifiedAt !== null,
      },
      organizations: await this.access.listOrganizations(auth.userId),
      active: auth.tenant
        ? {
            organizationId: auth.tenant.organizationId,
            membershipId: auth.tenant.membershipId,
            roleId: auth.tenant.roleId,
            roleSystemKey: auth.tenant.roleSystemKey,
            permissions: [...auth.tenant.permissions].map(([key, scope]) => ({ key, scope })),
          }
        : null,
    };
  }

  // ───────────────────────── Vérification d'e-mail ─────────────────────────

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.consumeToken(token, 'EMAIL_VERIFICATION');
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    await this.audit.record(this.prisma, {
      organizationId: null,
      actorUserId: userId,
      action: 'user.email_verified',
      entityType: 'user',
      entityId: userId,
    });
  }

  async resendVerification(auth: AuthUser): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (user.emailVerifiedAt) return;
    const token = await this.issueToken(auth.userId, 'EMAIL_VERIFICATION', EMAIL_VERIFICATION_TTL_MS);
    await this.sendVerificationEmail(user.email, token);
  }

  // ───────────────────── Réinitialisation du mot de passe ─────────────────────

  /** Réponse identique que le compte existe ou non (anti-énumération). */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') return;

    const token = await this.issueToken(user.id, 'PASSWORD_RESET', PASSWORD_RESET_TTL_MS);
    await this.audit.record(this.prisma, {
      organizationId: null,
      actorUserId: user.id,
      action: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: user.id,
    });
    await this.safeSend({
      to: email,
      template: 'password-reset',
      subject: 'Réinitialisation de votre mot de passe',
      variables: { url: this.webUrl('/reset-password', token), token },
    });
  }

  /** Change le mot de passe, lève le verrouillage et révoque TOUTES les sessions. */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const passwordHash = await this.passwords.hash(dto.password);
    const userId = await this.consumeToken(dto.token, 'PASSWORD_RESET');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    const revoked = await this.sessions.revokeAllForUser(userId, 'PASSWORD_RESET');
    await this.audit.record(this.prisma, {
      organizationId: null,
      actorUserId: userId,
      action: 'auth.password_reset_completed',
      entityType: 'user',
      entityId: userId,
      metadata: { revokedSessions: revoked },
    });
  }

  // ─────────────────────────────── Interne ───────────────────────────────

  /** Ouvre une session sur l'organisation demandée si elle est accessible, sinon la première. */
  async openSession(userId: string, preferredOrganizationId?: string) {
    const organizations = await this.access.listOrganizations(userId);
    const active = organizations.find((o) => o.id === preferredOrganizationId) ?? organizations[0] ?? null;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, locale: true, emailVerifiedAt: true },
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        emailVerified: user.emailVerifiedAt !== null,
      },
      tokens: await this.sessions.create(userId, active?.id ?? null),
      activeOrganizationId: active?.id ?? null,
      organizations,
    };
  }

  private async registerFailedLogin(userId: string): Promise<void> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    const locked = updated.failedLoginCount >= this.config.LOGIN_MAX_FAILED_ATTEMPTS;
    if (locked) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: 0,
          lockedUntil: new Date(Date.now() + this.config.LOGIN_LOCK_MINUTES * 60_000),
        },
      });
    }
    await this.audit.record(this.prisma, {
      organizationId: null,
      actorUserId: userId,
      action: locked ? 'auth.account_locked' : 'auth.login_failed',
      entityType: 'user',
      entityId: userId,
      metadata: { reason: 'bad_password' },
    });
  }

  /** Émet un jeton à usage unique et invalide les précédents du même type. */
  private async issueToken(userId: string, type: UserTokenType, ttlMs: number): Promise<string> {
    const token = generateOpaqueToken();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.userToken.updateMany({
        where: { userId, type, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.prisma.userToken.create({
        data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + ttlMs) },
      }),
    ]);
    return token;
  }

  /** Consomme atomiquement un jeton valide et retourne l'utilisateur concerné. */
  private async consumeToken(token: string, type: UserTokenType): Promise<string> {
    const tokenHash = hashToken(token);
    const now = new Date();
    const consumed = await this.prisma.userToken.updateMany({
      where: { tokenHash, type, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw invalidToken();
    const stored = await this.prisma.userToken.findUniqueOrThrow({
      where: { tokenHash },
      select: { userId: true },
    });
    return stored.userId;
  }

  private sendVerificationEmail(email: string, token: string): Promise<void> {
    return this.safeSend({
      to: email,
      template: 'email-verification',
      subject: 'Confirmez votre adresse e-mail',
      variables: { url: this.webUrl('/verify-email', token), token },
    });
  }

  private webUrl(path: string, token: string): string {
    const url = new URL(path, this.config.APP_WEB_URL);
    url.searchParams.set('token', token);
    return url.toString();
  }

  /** Un échec d'envoi ne doit ni faire échouer l'action ni révéler l'existence d'un compte. */
  private async safeSend(message: Parameters<Mailer['send']>[0]): Promise<void> {
    try {
      await this.mailer.send(message);
    } catch (error) {
      this.logger.error(
        `Échec d'envoi de l'e-mail « ${message.template} » : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
