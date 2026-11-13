import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { getConfig } from '../src/config/env';
import { type MailMessage, Mailer } from '../src/modules/mail/mail.module';

/** Remplace l'envoi d'e-mails : capture les messages pour en extraire les jetons. */
export class CapturingMailer extends Mailer {
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }

  /** Jeton du dernier e-mail de ce gabarit envoyé à cette adresse. */
  tokenFor(email: string, template: MailMessage['template']): string {
    const message = this.messages.findLast((m) => m.to === email.toLowerCase() && m.template === template);
    if (!message?.variables.token) throw new Error(`Aucun e-mail « ${template} » pour ${email}`);
    return message.variables.token;
  }

  countFor(email: string, template: MailMessage['template']): number {
    return this.messages.filter((m) => m.to === email.toLowerCase() && m.template === template).length;
  }
}

export interface TestContext {
  app: INestApplication<App>;
  mailer: CapturingMailer;
  /** Connexion superutilisateur : préparation et vérification hors RLS uniquement. */
  admin: Client;
  close(): Promise<void>;
}

/** Démarre l'application réelle (mêmes pipes, filtres et gardes que main.ts) sur la base de test. */
export async function createTestContext(): Promise<TestContext> {
  const mailer = new CapturingMailer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] })
    .overrideProvider(Mailer)
    .useValue(mailer)
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  configureApp(app, getConfig());
  await app.init();

  const admin = new Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
  await admin.connect();

  return {
    app,
    mailer,
    admin,
    async close() {
      await admin.end();
      await app.close();
    },
  };
}

export const API = '/api/v1';
export const PASSWORD = 'Correct-Horse-Battery-9';

export function uniqueEmail(label: string): string {
  return `${label}-${randomBytes(5).toString('hex')}@test.example`;
}

export interface Session {
  email: string;
  password: string;
  userId: string;
  organizationId: string;
  accessToken: string;
  refreshToken: string;
}

interface AuthResponseBody {
  user: { id: string };
  tokens: { accessToken: string; refreshToken: string };
  activeOrganizationId: string;
}

function toSession(email: string, password: string, body: AuthResponseBody): Session {
  return {
    email,
    password,
    userId: body.user.id,
    organizationId: body.activeOrganizationId,
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
  };
}

export function http(ctx: TestContext) {
  return request(ctx.app.getHttpServer());
}

export const bearer = (session: { accessToken: string } | string) =>
  `Bearer ${typeof session === 'string' ? session : session.accessToken}`;

/** Inscrit un utilisateur : crée son organisation, dont il est propriétaire. */
export async function registerOwner(
  ctx: TestContext,
  label: string,
  options: { verified?: boolean } = {},
): Promise<Session> {
  const email = uniqueEmail(label);
  const response = await http(ctx)
    .post(`${API}/auth/register`)
    .send({
      email,
      password: PASSWORD,
      name: `Owner ${label}`,
      organizationName: `Org ${label}`,
      country: 'BJ',
      currency: 'XOF',
      timezone: 'Africa/Porto-Novo',
    })
    .expect(201);
  if (options.verified ?? true) {
    await http(ctx)
      .post(`${API}/auth/email/verify`)
      .send({ token: ctx.mailer.tokenFor(email, 'email-verification') })
      .expect(204);
  }
  return toSession(email, PASSWORD, response.body as AuthResponseBody);
}

export interface RoleView {
  id: string;
  name: string;
  systemKey: string | null;
  isSystem: boolean;
  permissions: { key: string; scope: string }[];
}

export async function listRoles(ctx: TestContext, session: Session): Promise<RoleView[]> {
  const response = await http(ctx).get(`${API}/roles`).set('authorization', bearer(session)).expect(200);
  return response.body as RoleView[];
}

export async function systemRoleId(ctx: TestContext, session: Session, key: string): Promise<string> {
  const role = (await listRoles(ctx, session)).find((r) => r.systemKey === key);
  if (!role) throw new Error(`Rôle système ${key} introuvable`);
  return role.id;
}

export async function createRole(
  ctx: TestContext,
  session: Session,
  name: string,
  permissions: string[],
): Promise<RoleView> {
  const response = await http(ctx)
    .post(`${API}/roles`)
    .set('authorization', bearer(session))
    .send({ name, permissions: permissions.map((key) => ({ key })) })
    .expect(201);
  return response.body as RoleView;
}

/** Invite une adresse et retourne le jeton d'invitation (lu dans l'e-mail capturé). */
export async function invite(
  ctx: TestContext,
  inviter: Session,
  email: string,
  roleId: string,
): Promise<{ invitationId: string; token: string }> {
  const response = await http(ctx)
    .post(`${API}/invitations`)
    .set('authorization', bearer(inviter))
    .send({ email, roleId })
    .expect(201);
  return {
    invitationId: (response.body as { id: string }).id,
    token: ctx.mailer.tokenFor(email, 'organization-invitation'),
  };
}

/** Invite une nouvelle personne et lui fait créer son compte : retourne sa session et son membership. */
export async function addMember(
  ctx: TestContext,
  inviter: Session,
  label: string,
  roleId: string,
): Promise<Session & { membershipId: string }> {
  const email = uniqueEmail(label);
  const { token } = await invite(ctx, inviter, email, roleId);
  const response = await http(ctx)
    .post(`${API}/invitations/accept-signup`)
    .send({ token, name: `Member ${label}`, password: PASSWORD })
    .expect(201);
  const session = toSession(email, PASSWORD, response.body as AuthResponseBody);
  return { ...session, membershipId: await membershipIdOf(ctx, inviter, session.userId) };
}

export interface MemberView {
  id: string;
  status: string;
  user: { id: string; email: string; name: string };
  role: { id: string; name: string; systemKey: string | null };
}

export async function listMembers(ctx: TestContext, session: Session): Promise<MemberView[]> {
  const response = await http(ctx)
    .get(`${API}/members?limit=100`)
    .set('authorization', bearer(session))
    .expect(200);
  return (response.body as { items: MemberView[] }).items;
}

export async function membershipIdOf(ctx: TestContext, viewer: Session, userId: string): Promise<string> {
  const member = (await listMembers(ctx, viewer)).find((m) => m.user.id === userId);
  if (!member) throw new Error(`Membership introuvable pour ${userId}`);
  return member.id;
}

export async function login(
  ctx: TestContext,
  email: string,
  password: string,
  organizationId?: string,
): Promise<Session> {
  const response = await http(ctx)
    .post(`${API}/auth/login`)
    .send({ email, password, ...(organizationId ? { organizationId } : {}) })
    .expect(200);
  return toSession(email, password, response.body as AuthResponseBody);
}

export function errorCode(response: { body: unknown }): string | undefined {
  return (response.body as { error?: { code?: string } }).error?.code;
}
