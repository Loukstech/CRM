export type ApiErrorBody = {
  error?: { code: string; message: string; requestId?: string };
  message?: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
};

export type User = {
  id: string;
  email: string;
  name: string;
  locale: string;
  avatarUrl: string | null;
  emailVerified: boolean;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  role?: string;
  [key: string]: unknown;
};

export type Permission = { key: string; scope: string };

export type ActiveContext = {
  organizationId: string;
  membershipId: string;
  roleId: string;
  roleSystemKey: string | null;
  permissions: Permission[];
};

export type Me = { user: User; organizations: Organization[]; active: ActiveContext | null };

export type Session = {
  user: User;
  tokens: Tokens;
  activeOrganizationId: string | null;
  organizations: Organization[];
};

const TOKEN_KEY = 'louks-crm.tokens';

export const tokenStore = {
  read(): Tokens | null {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  write(tokens: Tokens): void {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  },
  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
  },
};

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'Réponse inattendue du serveur.');
  }
  if (!response.ok) {
    const err = (body as ApiErrorBody).error;
    throw new ApiError(
      response.status,
      err?.code ?? 'REQUEST_FAILED',
      err?.message ?? 'Une erreur est survenue.',
    );
  }
  return body as T;
}

let refreshing: Promise<Tokens> | null = null;

async function refreshTokens(): Promise<Tokens> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const current = tokenStore.read();
    if (!current?.refreshToken) throw new ApiError(401, 'UNAUTHENTICATED', 'Session expirée.');
    const response = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    const tokens = await parse<Tokens>(response);
    tokenStore.write(tokens);
    return tokens;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const tokens = tokenStore.read();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (tokens?.accessToken) headers.set('Authorization', `Bearer ${tokens.accessToken}`);

  const response = await fetch(`${BASE}/api/v1${path}`, { ...init, headers });

  if (response.status === 401 && retry && tokenStore.read()?.refreshToken) {
    try {
      await refreshTokens();
      return await apiFetch<T>(path, init, false);
    } catch {
      tokenStore.clear();
    }
  }
  return parse<T>(response);
}

const body = (data: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(data) });

export const api = {
  health: () => apiFetch<{ status: string; checks: Record<string, string> }>('/health/ready'),
  login: async (email: string, password: string, organizationId?: string) => {
    const session = await apiFetch<Session>('/auth/login', body({ email, password, organizationId }));
    tokenStore.write(session.tokens);
    return session;
  },
  register: async (input: {
    email: string;
    password: string;
    confirmPassword: string;
    name: string;
    organizationName: string;
    country: string;
    currency: string;
    timezone: string;
  }) => {
    const session = await apiFetch<Session>('/auth/register', body(input));
    tokenStore.write(session.tokens);
    return session;
  },
  me: () => apiFetch<Me>('/auth/me'),
  logout: async () => {
    try {
      await apiFetch<void>('/auth/logout', { method: 'POST' });
    } finally {
      tokenStore.clear();
    }
  },
  switchOrganization: async (organizationId: string) => {
    const result = await apiFetch<{ accessToken: string; activeOrganizationId: string }>(
      '/auth/switch-organization',
      body({ organizationId }),
    );
    const current = tokenStore.read();
    if (current) tokenStore.write({ ...current, accessToken: result.accessToken });
    return result;
  },
  verifyEmail: (token: string) => apiFetch<void>('/auth/email/verify', body({ token })),
  resendVerification: () => apiFetch<void>('/auth/email/resend', { method: 'POST' }),
  forgotPassword: (email: string) => apiFetch<void>('/auth/password/forgot', body({ email })),
  resetPassword: (token: string, password: string) =>
    apiFetch<void>('/auth/password/reset', body({ token, password })),

  listOrganizations: () => apiFetch<Organization[]>('/organizations'),
  getOrganization: () =>
    apiFetch<{
      id: string;
      name: string;
      slug: string;
      country: string;
      currency: string;
      timezone: string;
      locale: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>('/organizations/current'),
  updateOrganization: (data: Record<string, string>) =>
    apiFetch<Record<string, unknown>>('/organizations/current', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listMembers: (limit = 100) => apiFetch<Page<Member>>(`/members?limit=${limit}`),
  updateMember: (id: string, data: { roleId?: string; status?: string }) =>
    apiFetch<Member>(`/members/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeMember: (id: string) => apiFetch<void>(`/members/${id}`, { method: 'DELETE' }),

  listInvitations: () => apiFetch<Invitation[]>('/invitations'),
  createInvitation: (data: { email: string; roleId?: string }) =>
    apiFetch<Invitation>('/invitations', body(data)),
  revokeInvitation: (id: string) => apiFetch<void>(`/invitations/${id}`, { method: 'DELETE' }),
  acceptInvitation: (token: string) =>
    apiFetch<{ organizationId: string }>('/invitations/accept', body({ token })),
  acceptInvitationSignup: async (data: { token: string; name: string; password: string }) => {
    const session = await apiFetch<Session>('/invitations/accept-signup', body(data));
    tokenStore.write(session.tokens);
    return session;
  },

  listRoles: () => apiFetch<Role[]>('/roles'),
  listPermissions: () => apiFetch<PermissionInfo[]>('/permissions'),
  listAudit: (limit = 30, cursor?: string) =>
    apiFetch<Page<AuditEntry>>(
      `/audit-logs?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
};

export type Page<T> = { items: T[]; nextCursor?: string | null };
export type Member = {
  id: string;
  status: string;
  createdAt: string;
  user: { id: string; email: string; name: string; avatarUrl?: string | null };
  role?: { id: string; name: string; systemKey?: string | null } | null;
};
export type Invitation = {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  expiresAt?: string;
  role?: { id: string; name: string } | null;
};
export type Role = {
  id: string;
  name: string;
  description?: string | null;
  systemKey?: string | null;
  isSystem?: boolean;
  permissions?: string[];
  memberCount?: number;
};
export type PermissionInfo = { key: string; description: string; scoped: boolean };
export type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  actorUserId: string | null;
  ip: string | null;
  createdAt: string;
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Une erreur est survenue.';
}
