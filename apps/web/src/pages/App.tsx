import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { api, errorMessage, type AuditEntry, type Invitation, type Member, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  useToast,
} from '../components/ui';

function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);
  const reload = useCallback(() => {
    setLoading(true);
    load()
      .then(setData)
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, loading, error, reload };
}

function State({ loading, error, children }: { loading: boolean; error: string; children: ReactNode }) {
  if (loading) return <Card className="card__body muted">Chargement…</Card>;
  if (error) return <Card className="card__body auth__alert">{error}</Card>;
  return <>{children}</>;
}

function dateOf(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/* ---------------------------- Vue d'ensemble ---------------------------- */

export function DashboardPage() {
  const { me } = useAuth();
  const members = useLoad(() => api.listMembers(), []);
  const invitations = useLoad(() => api.listInvitations(), []);
  const roles = useLoad(() => api.listRoles(), []);
  const audit = useLoad(() => api.listAudit(6), []);
  const org = useLoad(() => api.getOrganization(), []);

  const firstName = me?.user.name.split(/\s+/)[0] ?? '';
  const stats = [
    { label: 'Membres actifs', value: members.data?.items.length ?? '—' },
    { label: 'Rôles définis', value: roles.data?.length ?? '—' },
    {
      label: 'Invitations en attente',
      value: invitations.data?.filter((item) => item.status === 'PENDING').length ?? '—',
    },
    { label: 'Événements journalisés', value: audit.data?.items.length ?? '—' },
  ];

  return (
    <>
      <PageHeader
        kicker="Votre espace"
        title={`Bonjour${firstName ? `, ${firstName}` : ''}.`}
        subtitle="Tout ce qui touche à votre organisation, au même endroit."
      />
      <div className="grid-stats">
        {stats.map((stat) => (
          <Card className="stat" key={stat.label}>
            <div className="stat__value">{stat.value}</div>
            <div className="stat__label">{stat.label}</div>
          </Card>
        ))}
      </div>
      <div className="grid-two">
        <Card>
          <div className="card__head">
            <span className="card__title">Activité récente</span>
            <Badge>Journal</Badge>
          </div>
          <div className="card__body">
            <State loading={audit.loading} error={audit.error}>
              {audit.data?.items.length ? (
                audit.data.items.map((entry) => (
                  <div className="audit-row" key={entry.id}>
                    <span className="audit-row__dot" />
                    <div>
                      <div className="audit-row__action">{entry.action}</div>
                      <div className="audit-row__meta">
                        {entry.entityType} · {entry.entityId.slice(0, 8)}
                      </div>
                    </div>
                    <time className="audit-row__date">{dateOf(entry.createdAt)}</time>
                  </div>
                ))
              ) : (
                <EmptyState title="Aucune activité" description="Les actions de l'équipe apparaîtront ici." />
              )}
            </State>
          </div>
        </Card>
        <Card>
          <div className="card__head">
            <span className="card__title">Organisation active</span>
            <ShieldCheck size={16} color="var(--accent)" />
          </div>
          <div className="card__body">
            <State loading={org.loading} error={org.error}>
              <dl className="detail-list">
                <dt>Nom</dt>
                <dd>{org.data?.name}</dd>
                <dt>Identifiant</dt>
                <dd className="mono">{org.data?.slug}</dd>
                <dt>Pays</dt>
                <dd>{org.data?.country}</dd>
                <dt>Devise</dt>
                <dd>{org.data?.currency}</dd>
                <dt>Fuseau</dt>
                <dd>{org.data?.timezone}</dd>
                <dt>Votre rôle</dt>
                <dd>{me?.active?.roleSystemKey ?? 'Personnalisé'}</dd>
              </dl>
            </State>
          </div>
        </Card>
      </div>
    </>
  );
}

/* ------------------------------- Équipe -------------------------------- */

export function TeamPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const members = useLoad(() => api.listMembers(), []);
  const roles = useLoad(() => api.listRoles(), []);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createInvitation({ email, ...(roleId ? { roleId } : {}) });
      notify(`Invitation envoyée à ${email}.`);
      setEmail('');
      setInviteOpen(false);
      members.reload();
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: Member, value: string) {
    try {
      await api.updateMember(member.id, { roleId: value });
      notify('Rôle mis à jour.');
      members.reload();
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`Retirer ${member.user.name} de l'organisation ?`)) return;
    try {
      await api.removeMember(member.id);
      notify('Membre retiré.');
      members.reload();
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    }
  }

  return (
    <>
      <PageHeader
        kicker="Espace de travail"
        title="Équipe"
        subtitle="Les personnes qui ont accès à cette organisation."
        actions={
          can('members.invite') ? (
            <Button icon={<Plus size={16} />} onClick={() => setInviteOpen(true)}>
              Inviter
            </Button>
          ) : null
        }
      />
      <Card>
        <State loading={members.loading} error={members.error}>
          {members.data?.items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Personne</th>
                    <th>Rôle</th>
                    <th>Statut</th>
                    <th>Depuis</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {members.data.items.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <div className="person">
                          <span className="avatar avatar--sm">
                            {member.user.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <strong>{member.user.name}</strong>
                            <small>{member.user.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {can('members.update') ? (
                          <Select
                            aria-label={`Rôle de ${member.user.name}`}
                            value={member.role?.id ?? ''}
                            onChange={(event) => void changeRole(member, event.target.value)}
                            style={{
                              minWidth: 160,
                              minHeight: 32,
                              padding: '4px 28px 4px 8px',
                              fontSize: 12,
                            }}
                          >
                            {roles.data?.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          (member.role?.name ?? '—')
                        )}
                      </td>
                      <td>
                        <Badge tone={member.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {member.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="muted">{dateOf(member.createdAt)}</td>
                      <td className="num">
                        {can('members.remove') ? (
                          <button
                            className="icon-btn"
                            onClick={() => void remove(member)}
                            aria-label="Retirer le membre"
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Personne dans l'équipe"
              description="Invitez un collègue pour commencer à travailler ensemble."
              action={
                can('members.invite') ? <Button onClick={() => setInviteOpen(true)}>Inviter</Button> : null
              }
            />
          )}
        </State>
      </Card>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Inviter une personne">
        <form className="auth__form" onSubmit={invite}>
          <Field label="Adresse e-mail" htmlFor="invite-email">
            <Input
              id="invite-email"
              type="email"
              required
              placeholder="collegue@entreprise.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Rôle" htmlFor="invite-role">
            <Select id="invite-role" value={roleId} onChange={(event) => setRoleId(event.target.value)}>
              <option value="">Rôle par défaut</option>
              {roles.data?.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" full loading={busy}>
            Envoyer l’invitation
          </Button>
        </form>
      </Modal>
    </>
  );
}

/* ----------------------------- Invitations ----------------------------- */

export function InvitationsPage() {
  const { notify } = useToast();
  const invitations = useLoad(() => api.listInvitations(), []);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createInvitation({ email });
      notify('Invitation envoyée.');
      setEmail('');
      invitations.reload();
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(invitation: Invitation) {
    try {
      await api.revokeInvitation(invitation.id);
      notify('Invitation révoquée.');
      invitations.reload();
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    }
  }

  return (
    <>
      <PageHeader
        kicker="Espace de travail"
        title="Invitations"
        subtitle="Les invitations en attente de réponse."
      />
      <Card className="card__body">
        <form className="auth__form" onSubmit={create} style={{ maxWidth: 520 }}>
          <Field label="Inviter par e-mail" htmlFor="quick-invite">
            <Input
              id="quick-invite"
              type="email"
              required
              placeholder="collegue@entreprise.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={busy} icon={<Plus size={16} />}>
            Envoyer
          </Button>
        </form>
      </Card>
      <Card>
        <State loading={invitations.loading} error={invitations.error}>
          {invitations.data?.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Adresse</th>
                    <th>Rôle</th>
                    <th>Statut</th>
                    <th>Envoyée le</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invitations.data.map((invitation) => (
                    <tr key={invitation.id}>
                      <td>{invitation.email}</td>
                      <td>{invitation.role?.name ?? 'Par défaut'}</td>
                      <td>
                        <Badge tone={invitation.status === 'PENDING' ? 'brass' : 'neutral'}>
                          {invitation.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="muted">{dateOf(invitation.createdAt)}</td>
                      <td className="num">
                        <button
                          className="icon-btn"
                          onClick={() => void revoke(invitation)}
                          aria-label="Révoquer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Aucune invitation"
              description="Les invitations en attente s'afficheront ici."
            />
          )}
        </State>
      </Card>
    </>
  );
}

/* ---------------------------- Rôles & accès ---------------------------- */

export function AccessPage() {
  const roles = useLoad(() => api.listRoles(), []);
  const permissions = useLoad(() => api.listPermissions(), []);

  return (
    <>
      <PageHeader
        kicker="Paramètres"
        title="Rôles & accès"
        subtitle="Qui peut faire quoi dans cette organisation."
      />
      <State loading={roles.loading} error={roles.error}>
        <div className="grid-stats">
          {roles.data?.map((role) => (
            <Card className="stat" key={role.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong>{role.name}</strong>
                {role.systemKey ? <Badge tone="brass">système</Badge> : null}
              </div>
              <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                {role.description || 'Rôle personnalisé'}
              </p>
            </Card>
          ))}
        </div>
      </State>
      <Card>
        <div className="card__head">
          <span className="card__title">Catalogue des permissions</span>
          <Badge>{permissions.data?.length ?? 0}</Badge>
        </div>
        <div className="card__body">
          <State loading={permissions.loading} error={permissions.error}>
            <div className="perm-grid">
              {permissions.data?.map((permission) => (
                <div className="perm" key={permission.key}>
                  <ShieldCheck size={14} />
                  <div>
                    <code>{permission.key}</code>
                    <small>{permission.description}</small>
                  </div>
                </div>
              ))}
            </div>
          </State>
        </div>
      </Card>
    </>
  );
}

/* ------------------------------- Audit --------------------------------- */

export function AuditPage() {
  const [entries, setEntries] = useState<Page<AuditEntry> | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback((next?: string | null) => {
    setLoading(true);
    api
      .listAudit(30, next ?? undefined)
      .then((page) => {
        setEntries((current) =>
          next ? { items: [...(current?.items ?? []), ...page.items], nextCursor: page.nextCursor } : page,
        );
        setCursor(page.nextCursor ?? null);
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  return (
    <>
      <PageHeader
        kicker="Traçabilité"
        title="Journal d’activité"
        subtitle="Les actions enregistrées dans cette organisation."
      />
      <Card>
        <State loading={loading && !entries} error={error}>
          {entries?.items.length ? (
            <div className="card__body">
              {entries.items.map((entry) => (
                <div className="audit-row" key={entry.id}>
                  <span className="audit-row__dot" />
                  <div>
                    <div className="audit-row__action">{entry.action}</div>
                    <div className="audit-row__meta">
                      {entry.entityType} · {entry.entityId.slice(0, 8)}
                      {entry.ip ? ` · ${entry.ip}` : ''}
                    </div>
                  </div>
                  <time className="audit-row__date">{dateOf(entry.createdAt)}</time>
                </div>
              ))}
              {cursor ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 20 }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={loading}
                    icon={<ArrowDown size={15} />}
                    onClick={() => load(cursor)}
                  >
                    Charger plus
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState title="Journal vide" description="Aucune action enregistrée pour le moment." />
          )}
        </State>
      </Card>
    </>
  );
}

/* ---------------------------- Organisation ---------------------------- */

export function OrganizationPage() {
  const { can, refresh } = useAuth();
  const { notify } = useToast();
  const org = useLoad(() => api.getOrganization(), []);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (org.data) setForm(org.data as unknown as Record<string, string>);
  }, [org.data]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.updateOrganization({
        name: form.name,
        country: form.country,
        currency: form.currency,
        timezone: form.timezone,
        locale: form.locale,
      });
      notify('Organisation mise à jour.');
      await refresh();
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  }

  const editable = can('organization.update');
  const fields = useMemo(
    () => [
      { key: 'name', label: 'Nom de l’organisation' },
      { key: 'country', label: 'Pays (code ISO)' },
      { key: 'currency', label: 'Devise (code ISO)' },
      { key: 'timezone', label: 'Fuseau horaire' },
      { key: 'locale', label: 'Langue' },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        kicker="Paramètres"
        title="Organisation"
        subtitle="L'identité et les préférences de votre espace."
      />
      <Card className="card__body" style={{ maxWidth: 680 }}>
        <State loading={org.loading} error={org.error}>
          <form className="auth__form" onSubmit={save}>
            {fields.map((field) => (
              <Field key={field.key} label={field.label} htmlFor={`org-${field.key}`}>
                <Input
                  id={`org-${field.key}`}
                  value={form[field.key] ?? ''}
                  disabled={!editable}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              </Field>
            ))}
            <div className="mono muted">Identifiant public : {org.data?.slug}</div>
            {editable ? (
              <Button type="submit" loading={busy}>
                Enregistrer les modifications
              </Button>
            ) : null}
          </form>
        </State>
      </Card>
    </>
  );
}
