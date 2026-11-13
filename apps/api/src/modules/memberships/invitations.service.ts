import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AuthUser, type TenantAuth, dbScopeOf } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { isUniqueViolation } from '../../common/validators';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { TenantDb, type Tx, applyDbScope } from '../../database/tenant-db.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService, generateOpaqueToken, hashToken, normalizeEmail } from '../auth/crypto';
import { Mailer } from '../mail/mail.module';
import { assertCanGrantRole } from '../roles/roles.service';

const INVITATION_TTL_MS = 7 * 86_400_000;

const INVITATION_VIEW = {
  id: true,
  email: true,
  status: true,
  createdAt: true,
  expiresAt: true,
  role: { select: { id: true, name: true, systemKey: true } },
  invitedBy: { select: { id: true, name: true } },
} as const;

const invalidInvitation = () =>
  AppError.badRequest('INVALID_INVITATION', 'Invitation invalide, expirée ou déjà utilisée.');

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
    private readonly passwords: PasswordService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  list(auth: TenantAuth) {
    return this.db.run(dbScopeOf(auth), (tx) =>
      tx.invitation.findMany({
        where: { organizationId: auth.tenant.organizationId, status: 'PENDING' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: INVITATION_VIEW,
      }),
    );
  }

  async create(auth: TenantAuth, dto: { email: string; roleId: string }) {
    if (!auth.emailVerified) {
      throw AppError.forbidden(
        'EMAIL_NOT_VERIFIED',
        "Confirmez votre adresse e-mail avant d'inviter des membres.",
      );
    }
    const email = normalizeEmail(dto.email);
    const { organizationId } = auth.tenant;
    const token = generateOpaqueToken();

    let result: { invitation: { id: string }; organizationName: string };
    try {
      result = await this.db.run(dbScopeOf(auth), async (tx) => {
        const role = await tx.role.findFirst({
          where: { id: dto.roleId, organizationId },
          select: {
            id: true,
            systemKey: true,
            permissions: { select: { permissionKey: true, scope: true } },
          },
        });
        if (!role) throw AppError.notFound('Rôle introuvable.');
        assertCanGrantRole(auth, role);

        const alreadyMember = await tx.membership.findFirst({
          where: { organizationId, user: { email } },
          select: { id: true },
        });
        if (alreadyMember) {
          throw AppError.conflict('ALREADY_MEMBER', "Cette personne est déjà membre de l'organisation.");
        }
        const pending = await tx.invitation.findFirst({
          where: { organizationId, email, status: 'PENDING' },
          select: { id: true },
        });
        if (pending) throw this.alreadyPending();

        const invitation = await tx.invitation.create({
          data: {
            organizationId,
            email,
            roleId: role.id,
            tokenHash: hashToken(token),
            invitedByUserId: auth.userId,
            expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          },
          select: INVITATION_VIEW,
        });
        await this.audit.record(tx, {
          organizationId,
          actorUserId: auth.userId,
          action: 'invitation.created',
          entityType: 'invitation',
          entityId: invitation.id,
          metadata: { email, roleId: role.id },
        });
        const organization = await tx.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: { name: true },
        });
        return { invitation, organizationName: organization.name };
      });
    } catch (error) {
      // Course entre deux invitations simultanées : l'index unique partiel tranche.
      if (isUniqueViolation(error, 'Invitation')) throw this.alreadyPending();
      throw error;
    }

    const url = new URL('/accept-invitation', this.config.APP_WEB_URL);
    url.searchParams.set('token', token);
    try {
      await this.mailer.send({
        to: email,
        template: 'organization-invitation',
        subject: `Invitation à rejoindre ${result.organizationName}`,
        variables: { url: url.toString(), token, organizationName: result.organizationName },
      });
    } catch (error) {
      this.logger.error(
        `Échec d'envoi de l'invitation ${result.invitation.id} : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // Le jeton n'est jamais renvoyé par l'API : il ne transite que par l'e-mail.
    return result.invitation;
  }

  async revoke(auth: TenantAuth, invitationId: string): Promise<void> {
    const { organizationId } = auth.tenant;
    await this.db.run(dbScopeOf(auth), async (tx) => {
      const revoked = await tx.invitation.updateMany({
        where: { id: invitationId, organizationId, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });
      if (revoked.count !== 1) throw AppError.notFound('Invitation en attente introuvable.');
      await this.audit.record(tx, {
        organizationId,
        actorUserId: auth.userId,
        action: 'invitation.revoked',
        entityType: 'invitation',
        entityId: invitationId,
      });
    });
  }

  /** Acceptation par un utilisateur déjà inscrit et connecté. */
  async accept(auth: AuthUser, token: string): Promise<{ organizationId: string }> {
    return this.db.run({ userId: auth.userId }, async (tx) => {
      const invitation = await this.loadPendingInvitation(tx, token, auth.userId);
      const user = await tx.user.findUniqueOrThrow({
        where: { id: auth.userId },
        select: { email: true, emailVerifiedAt: true },
      });
      if (user.email !== invitation.email) {
        throw AppError.forbidden(
          'INVITATION_EMAIL_MISMATCH',
          'Cette invitation est destinée à une autre adresse e-mail.',
        );
      }
      await this.join(tx, invitation, auth.userId);
      // Le jeton a été reçu sur cette adresse : elle est de fait vérifiée.
      if (!user.emailVerifiedAt) {
        await tx.user.update({ where: { id: auth.userId }, data: { emailVerifiedAt: new Date() } });
      }
      return { organizationId: invitation.organizationId };
    });
  }

  /** Acceptation par une personne sans compte : crée le compte puis le membership. */
  async acceptWithSignup(dto: {
    token: string;
    name: string;
    password: string;
  }): Promise<{ userId: string; organizationId: string }> {
    const passwordHash = await this.passwords.hash(dto.password);
    const userId = randomUUID();

    try {
      return await this.db.run({ userId }, async (tx) => {
        const invitation = await this.loadPendingInvitation(tx, dto.token, userId);
        await tx.user.create({
          data: {
            id: userId,
            email: invitation.email,
            name: dto.name,
            passwordHash,
            emailVerifiedAt: new Date(),
          },
        });
        await this.join(tx, invitation, userId);
        return { userId, organizationId: invitation.organizationId };
      });
    } catch (error) {
      if (isUniqueViolation(error, 'User')) {
        throw AppError.conflict(
          'ACCOUNT_EXISTS',
          "Un compte existe déjà pour cette adresse : connectez-vous puis acceptez l'invitation.",
        );
      }
      throw error;
    }
  }

  /**
   * Retrouve l'invitation à partir du jeton (hors contexte d'organisation : la
   * policy RLS n'expose que la ligne dont le hash correspond), puis bascule la
   * transaction sur l'organisation de l'invitation — identifiant lu en base,
   * jamais fourni par le client.
   */
  private async loadPendingInvitation(tx: Tx, token: string, userId: string) {
    const tokenHash = hashToken(token);
    await applyDbScope(tx, { userId, invitationTokenHash: tokenHash });
    const invitation = await tx.invitation.findUnique({
      where: { tokenHash },
      select: { id: true, organizationId: true, email: true, roleId: true, status: true, expiresAt: true },
    });
    if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt <= new Date()) {
      throw invalidInvitation();
    }

    await applyDbScope(tx, { organizationId: invitation.organizationId, userId });
    const organization = await tx.organization.findFirst({
      where: { id: invitation.organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!organization) throw invalidInvitation();
    return invitation;
  }

  private async join(
    tx: Tx,
    invitation: { id: string; organizationId: string; roleId: string },
    userId: string,
  ): Promise<void> {
    const { organizationId } = invitation;
    const existing = await tx.membership.findFirst({
      where: { organizationId, userId },
      select: { id: true },
    });
    if (existing) {
      throw AppError.conflict('ALREADY_MEMBER', 'Vous êtes déjà membre de cette organisation.');
    }
    // Prise atomique de l'invitation : une seule acceptation possible.
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, organizationId, status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalidInvitation();

    const membership = await tx.membership.create({
      data: { organizationId, userId, roleId: invitation.roleId },
      select: { id: true },
    });
    await this.audit.record(tx, {
      organizationId,
      actorUserId: userId,
      action: 'invitation.accepted',
      entityType: 'membership',
      entityId: membership.id,
      metadata: { invitationId: invitation.id, roleId: invitation.roleId },
    });
  }

  private alreadyPending(): AppError {
    return AppError.conflict(
      'INVITATION_ALREADY_PENDING',
      'Une invitation est déjà en attente pour cette adresse.',
    );
  }
}
