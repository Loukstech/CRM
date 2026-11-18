import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, Search, Tag as TagIcon, Trash2, X } from 'lucide-react';
import {
  api,
  CONTACT_STATUS_LABELS,
  contactName,
  errorMessage,
  type Company,
  type CompanyTag,
  type Contact,
  type ContactInput,
  type ContactStatus,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { State, useLoad } from '../components/Async';
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
  Textarea,
  useToast,
} from '../components/ui';

const PAGE_SIZE = 25;
const STATUS_OPTIONS = Object.entries(CONTACT_STATUS_LABELS) as [ContactStatus, string][];

function dateOf(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
}

function TagChip({ tag }: { tag: CompanyTag }) {
  return (
    <span className="tag-chip">
      <span className="tag-chip__dot" style={{ background: tag.color }} />
      {tag.name}
    </span>
  );
}

/* ============================== Contacts ============================== */

export function ContactsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<ContactStatus | ''>('');
  const [companyId, setCompanyId] = useState('');
  const [tagId, setTagId] = useState('');

  const [items, setItems] = useState<Contact[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [open, setOpen] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagVersion, setTagVersion] = useState(0);

  const companies = useLoad(() => api.listCompanies({ limit: 100 }), []);
  const tags = useLoad(() => api.listTags(true), [tagVersion]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await api.listContacts({ q: debounced, status, companyId, tagId, limit: PAGE_SIZE });
      setItems(page.items);
      setCursor(page.nextCursor ?? null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [debounced, status, companyId, tagId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.listContacts({
        q: debounced,
        status,
        companyId,
        tagId,
        limit: PAGE_SIZE,
        cursor,
      });
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor ?? null);
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = Boolean(debounced || status || companyId || tagId);

  return (
    <>
      <PageHeader
        kicker="Relation client"
        title="Contacts"
        subtitle="Les personnes que votre organisation suit, avec leurs coordonnées et leurs étiquettes."
        actions={
          <div className="page-header__actions">
            {can('tags.manage') ? (
              <Button variant="ghost" icon={<TagIcon size={16} />} onClick={() => setTagsOpen(true)}>
                Étiquettes
              </Button>
            ) : null}
            {can('contacts.create') ? (
              <Button icon={<Plus size={16} />} onClick={() => setOpen('new')}>
                Nouveau contact
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="toolbar">
        <div className="toolbar__search">
          <Search size={16} aria-hidden />
          <Input
            aria-label="Rechercher un contact"
            placeholder="Nom, e-mail, téléphone, entreprise…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          aria-label="Statut"
          value={status}
          onChange={(event) => setStatus(event.target.value as ContactStatus | '')}
        >
          <option value="">Tous les statuts</option>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Entreprise"
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
        >
          <option value="">Toutes les entreprises</option>
          {companies.data?.items.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Étiquette" value={tagId} onChange={(event) => setTagId(event.target.value)}>
          <option value="">Toutes les étiquettes</option>
          {tags.data?.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setStatus('');
              setCompanyId('');
              setTagId('');
            }}
          >
            Réinitialiser
          </Button>
        ) : null}
      </Card>

      {loading ? (
        <Card className="card__body muted">Chargement des contacts…</Card>
      ) : error ? (
        <Card className="card__body auth__alert">{error}</Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title={filtered ? 'Aucun contact ne correspond' : 'Aucun contact pour le moment'}
            description={
              filtered
                ? 'Élargissez la recherche ou retirez un filtre.'
                : 'Ajoutez votre premier contact : c’est la brique de base de toute la relation client.'
            }
            action={
              can('contacts.create') && !filtered ? (
                <Button icon={<Plus size={16} />} onClick={() => setOpen('new')}>
                  Créer un contact
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Personne</th>
                  <th>Entreprise</th>
                  <th>Statut</th>
                  <th>Étiquettes</th>
                  <th>Propriétaire</th>
                  <th>Créé le</th>
                </tr>
              </thead>
              <tbody>
                {items.map((contact) => (
                  <tr
                    key={contact.id}
                    className="table__row--clickable"
                    tabIndex={0}
                    onClick={() => setOpen(contact.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setOpen(contact.id);
                      }
                    }}
                  >
                    <td>
                      <div className="cell-person">
                        <span className="cell-person__name">{contactName(contact)}</span>
                        <span className="cell-person__meta">
                          {[contact.jobTitle, contact.email].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </div>
                    </td>
                    <td>{contact.company?.name ?? <span className="muted">—</span>}</td>
                    <td>
                      <Badge
                        tone={
                          contact.status === 'CUSTOMER'
                            ? 'success'
                            : contact.status === 'INACTIVE'
                              ? 'neutral'
                              : 'brass'
                        }
                      >
                        {CONTACT_STATUS_LABELS[contact.status]}
                      </Badge>
                    </td>
                    <td>
                      {contact.tags.length ? (
                        <div className="tag-list">
                          {contact.tags.map((tag) => (
                            <TagChip key={tag.id} tag={tag} />
                          ))}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{contact.owner?.user.name ?? <span className="muted">Non attribué</span>}</td>
                    <td className="muted">{dateOf(contact.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card__foot">
            <span className="muted">
              {items.length} contact{items.length > 1 ? 's' : ''} affiché{items.length > 1 ? 's' : ''}
            </span>
            {cursor ? (
              <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
                Charger plus
              </Button>
            ) : null}
          </div>
        </Card>
      )}

      {open ? (
        <ContactPanel
          contactId={open}
          tags={tags.data ?? []}
          companies={companies.data?.items ?? []}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            void load();
            setTagVersion((value) => value + 1);
          }}
        />
      ) : null}

      {tagsOpen ? (
        <TagsModal
          tags={tags.data ?? []}
          onClose={() => setTagsOpen(false)}
          onChanged={() => setTagVersion((value) => value + 1)}
        />
      ) : null}
    </>
  );
}

/* --------------------------- Panneau contact --------------------------- */

type ContactForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  jobTitle: string;
  companyId: string;
  status: ContactStatus;
  source: string;
  notes: string;
  tagIds: string[];
};

const EMPTY_FORM: ContactForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  jobTitle: '',
  companyId: '',
  status: 'LEAD',
  source: '',
  notes: '',
  tagIds: [],
};

function toForm(contact: Contact): ContactForm {
  return {
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    jobTitle: contact.jobTitle ?? '',
    companyId: contact.companyId ?? '',
    status: contact.status,
    source: contact.source ?? '',
    notes: contact.notes ?? '',
    tagIds: contact.tags.map((tag) => tag.id),
  };
}

/** Une chaîne vide devient `null` : c'est ainsi qu'on efface un champ côté API. */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function ContactPanel({
  contactId,
  tags,
  companies,
  onClose,
  onSaved,
}: {
  contactId: string;
  tags: CompanyTag[];
  companies: Company[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can } = useAuth();
  const { notify } = useToast();
  const isNew = contactId === 'new';
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState<Contact | null>(null);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    api
      .getContact(contactId)
      .then((contact) => {
        if (!active) return;
        setLoaded(contact);
        setForm(toForm(contact));
      })
      .catch((cause: unknown) => active && setError(errorMessage(cause)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [contactId, isNew]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof ContactForm>(key: K, value: ContactForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function toggleTag(id: string) {
    setForm((current) => ({
      ...current,
      tagIds: current.tagIds.includes(id)
        ? current.tagIds.filter((value) => value !== id)
        : [...current.tagIds, id],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.firstName.trim() && !form.lastName.trim()) {
      setError('Indiquez au moins un prénom ou un nom.');
      return;
    }
    const payload: ContactInput = {
      firstName: orNull(form.firstName),
      lastName: orNull(form.lastName),
      email: orNull(form.email),
      phone: orNull(form.phone),
      jobTitle: orNull(form.jobTitle),
      companyId: form.companyId || null,
      status: form.status,
      source: orNull(form.source),
      notes: orNull(form.notes),
      tagIds: form.tagIds,
    };
    setSaving(true);
    setError('');
    try {
      if (isNew) {
        await api.createContact(payload);
        notify('Contact créé.');
      } else {
        await api.updateContact(contactId, payload);
        notify('Contact mis à jour.');
      }
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!loaded) return;
    if (!window.confirm(`Supprimer « ${contactName(loaded)} » ? La fiche sortira des listes.`)) return;
    setDeleting(true);
    try {
      await api.deleteContact(contactId);
      notify('Contact supprimé.');
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDeleting(false);
    }
  }

  const editable = isNew ? can('contacts.create') : can('contacts.update');

  return (
    <div className="panel-backdrop" onMouseDown={onClose}>
      <aside
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? 'Nouveau contact' : 'Fiche contact'}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="panel__head">
          <div>
            <p className="eyebrow">{isNew ? 'Création' : 'Fiche contact'}</p>
            <h2 className="display panel__title">
              {isNew ? 'Nouveau contact' : loaded ? contactName(loaded) : '…'}
            </h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </header>

        {loading ? (
          <div className="panel__body muted">Chargement…</div>
        ) : (
          <form className="panel__form" onSubmit={(event) => void submit(event)}>
            <div className="panel__body">
              {error ? (
                <p className="auth__alert" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="form-grid">
                <Field label="Prénom" htmlFor="c-first">
                  <Input
                    id="c-first"
                    value={form.firstName}
                    maxLength={100}
                    disabled={!editable}
                    onChange={(event) => set('firstName', event.target.value)}
                  />
                </Field>
                <Field label="Nom" htmlFor="c-last">
                  <Input
                    id="c-last"
                    value={form.lastName}
                    maxLength={100}
                    disabled={!editable}
                    onChange={(event) => set('lastName', event.target.value)}
                  />
                </Field>
              </div>

              <Field
                label="E-mail"
                htmlFor="c-mail"
                hint="Deux contacts peuvent partager une adresse générique."
              >
                <Input
                  id="c-mail"
                  type="email"
                  value={form.email}
                  maxLength={320}
                  disabled={!editable}
                  onChange={(event) => set('email', event.target.value)}
                />
              </Field>

              <div className="form-grid">
                <Field label="Téléphone" htmlFor="c-phone">
                  <Input
                    id="c-phone"
                    value={form.phone}
                    maxLength={40}
                    disabled={!editable}
                    onChange={(event) => set('phone', event.target.value)}
                  />
                </Field>
                <Field label="Fonction" htmlFor="c-job">
                  <Input
                    id="c-job"
                    value={form.jobTitle}
                    maxLength={120}
                    disabled={!editable}
                    onChange={(event) => set('jobTitle', event.target.value)}
                  />
                </Field>
              </div>

              <div className="form-grid">
                <Field label="Entreprise" htmlFor="c-company">
                  <Select
                    id="c-company"
                    value={form.companyId}
                    disabled={!editable}
                    onChange={(event) => set('companyId', event.target.value)}
                  >
                    <option value="">Aucune</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Statut" htmlFor="c-status">
                  <Select
                    id="c-status"
                    value={form.status}
                    disabled={!editable}
                    onChange={(event) => set('status', event.target.value as ContactStatus)}
                  >
                    {STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Origine" htmlFor="c-source" hint="Salon, recommandation, site web…">
                <Input
                  id="c-source"
                  value={form.source}
                  maxLength={80}
                  disabled={!editable}
                  onChange={(event) => set('source', event.target.value)}
                />
              </Field>

              <Field label="Étiquettes" htmlFor="c-tags">
                {tags.length ? (
                  <div className="tag-picker" id="c-tags">
                    {tags.map((tag) => {
                      const active = form.tagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          className={`tag-option${active ? ' active' : ''}`}
                          aria-pressed={active}
                          disabled={!editable}
                          onClick={() => toggleTag(tag.id)}
                        >
                          <span className="tag-chip__dot" style={{ background: tag.color }} />
                          {tag.name}
                          {active ? <Check size={13} aria-hidden /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted">Aucune étiquette définie dans l’organisation.</p>
                )}
              </Field>

              <Field label="Notes" htmlFor="c-notes">
                <Textarea
                  id="c-notes"
                  rows={4}
                  value={form.notes}
                  disabled={!editable}
                  onChange={(event) => set('notes', event.target.value)}
                />
              </Field>

              {loaded ? (
                <dl className="detail-list">
                  <dt>Propriétaire</dt>
                  <dd>{loaded.owner?.user.name ?? 'Non attribué'}</dd>
                  <dt>Créé le</dt>
                  <dd>{dateOf(loaded.createdAt)}</dd>
                  <dt>Modifié le</dt>
                  <dd>{dateOf(loaded.updatedAt)}</dd>
                </dl>
              ) : null}
            </div>

            <div className="panel__foot">
              {!isNew && can('contacts.delete') ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={15} />}
                  loading={deleting}
                  onClick={() => void remove()}
                >
                  Supprimer
                </Button>
              ) : (
                <span />
              )}
              <div className="panel__foot-actions">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Fermer
                </Button>
                {editable ? (
                  <Button type="submit" loading={saving}>
                    {isNew ? 'Créer le contact' : 'Enregistrer'}
                  </Button>
                ) : null}
              </div>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}

/* --------------------------- Gestion étiquettes --------------------------- */

function TagsModal({
  tags,
  onClose,
  onChanged,
}: {
  tags: CompanyTag[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#64748b');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createTag({ name: name.trim(), color });
      setName('');
      onChanged();
      notify('Étiquette créée.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function rename(tag: CompanyTag, value: string) {
    if (!value.trim() || value.trim() === tag.name) return;
    try {
      await api.updateTag(tag.id, { name: value.trim() });
      onChanged();
      notify('Étiquette renommée.');
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    }
  }

  async function recolor(tag: CompanyTag, value: string) {
    try {
      await api.updateTag(tag.id, { color: value });
      onChanged();
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    }
  }

  async function remove(tag: CompanyTag) {
    if (!window.confirm(`Supprimer l’étiquette « ${tag.name} » ? Elle sera retirée de tous les contacts.`)) {
      return;
    }
    try {
      await api.deleteTag(tag.id);
      onChanged();
      notify('Étiquette supprimée.');
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    }
  }

  return (
    <Modal open onClose={onClose} title="Étiquettes">
      {error ? (
        <p className="auth__alert" role="alert">
          {error}
        </p>
      ) : null}
      <form className="tag-create" onSubmit={(event) => void create(event)}>
        <Input
          aria-label="Nom de la nouvelle étiquette"
          placeholder="Nouvelle étiquette"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          type="color"
          aria-label="Couleur"
          className="color-input"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
        <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>
          Ajouter
        </Button>
      </form>

      {tags.length === 0 ? (
        <p className="muted">Aucune étiquette. Créez-en une pour classer vos contacts.</p>
      ) : (
        <ul className="tag-manage">
          {tags.map((tag) => (
            <li key={tag.id} className="tag-manage__row">
              <input
                type="color"
                aria-label={`Couleur de ${tag.name}`}
                className="color-input"
                value={tag.color}
                onChange={(event) => void recolor(tag, event.target.value)}
              />
              <Input
                defaultValue={tag.name}
                maxLength={60}
                aria-label={`Nom de ${tag.name}`}
                onBlur={(event) => void rename(tag, event.target.value)}
              />
              <span className="muted tag-manage__count">{tag._count?.contacts ?? 0}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Supprimer ${tag.name}`}
                onClick={() => void remove(tag)}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* ============================= Entreprises ============================= */

type CompanyForm = {
  name: string;
  domain: string;
  industry: string;
  phone: string;
  website: string;
  addressLine: string;
  city: string;
  country: string;
  notes: string;
};

const EMPTY_COMPANY: CompanyForm = {
  name: '',
  domain: '',
  industry: '',
  phone: '',
  website: '',
  addressLine: '',
  city: '',
  country: '',
  notes: '',
};

export function CompaniesPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [editing, setEditing] = useState<Company | 'new' | null>(null);

  const companies = useLoad(() => api.listCompanies({ q: debounced, limit: 100 }), [debounced]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function remove(company: Company) {
    if (!window.confirm(`Supprimer « ${company.name} » ?`)) return;
    try {
      await api.deleteCompany(company.id);
      notify('Entreprise supprimée.');
      companies.reload();
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    }
  }

  return (
    <>
      <PageHeader
        kicker="Relation client"
        title="Entreprises"
        subtitle="Les organisations clientes, prospects ou partenaires, et leurs contacts."
        actions={
          can('companies.manage') ? (
            <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
              Nouvelle entreprise
            </Button>
          ) : null
        }
      />

      <Card className="toolbar">
        <div className="toolbar__search">
          <Search size={16} aria-hidden />
          <Input
            aria-label="Rechercher une entreprise"
            placeholder="Nom, domaine, ville…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </Card>

      <State loading={companies.loading} error={companies.error}>
        {companies.data?.items.length ? (
          <Card>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Entreprise</th>
                    <th>Secteur</th>
                    <th>Ville</th>
                    <th className="num">Contacts</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {companies.data.items.map((company) => (
                    <tr key={company.id}>
                      <td>
                        <div className="cell-person">
                          <span className="cell-person__name">{company.name}</span>
                          <span className="cell-person__meta">
                            {[company.domain, company.website].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </div>
                      </td>
                      <td>{company.industry ?? <span className="muted">—</span>}</td>
                      <td>{company.city ?? <span className="muted">—</span>}</td>
                      <td className="num">{company.contactCount}</td>
                      <td>
                        {can('companies.manage') ? (
                          <div className="row-actions">
                            <button
                              className="icon-btn"
                              aria-label={`Modifier ${company.name}`}
                              onClick={() => setEditing(company)}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="icon-btn"
                              aria-label={`Supprimer ${company.name}`}
                              onClick={() => void remove(company)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState
              title={debounced ? 'Aucune entreprise ne correspond' : 'Aucune entreprise'}
              description={
                debounced
                  ? 'Essayez un autre terme de recherche.'
                  : 'Regroupez vos contacts par société pour suivre vos comptes clés.'
              }
              action={
                can('companies.manage') && !debounced ? (
                  <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
                    Créer une entreprise
                  </Button>
                ) : null
              }
            />
          </Card>
        )}
      </State>

      {editing ? (
        <CompanyModal
          company={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            companies.reload();
          }}
        />
      ) : null}
    </>
  );
}

function CompanyModal({
  company,
  onClose,
  onSaved,
}: {
  company: Company | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const [form, setForm] = useState<CompanyForm>(
    company
      ? {
          name: company.name,
          domain: company.domain ?? '',
          industry: company.industry ?? '',
          phone: company.phone ?? '',
          website: company.website ?? '',
          addressLine: company.addressLine ?? '',
          city: company.city ?? '',
          country: company.country ?? '',
          notes: company.notes ?? '',
        }
      : EMPTY_COMPANY,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof CompanyForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      domain: orNull(form.domain),
      industry: orNull(form.industry),
      phone: orNull(form.phone),
      website: orNull(form.website),
      addressLine: orNull(form.addressLine),
      city: orNull(form.city),
      country: orNull(form.country)?.toUpperCase() ?? null,
      notes: orNull(form.notes),
    };
    try {
      if (company) {
        await api.updateCompany(company.id, payload);
        notify('Entreprise mise à jour.');
      } else {
        await api.createCompany(payload);
        notify('Entreprise créée.');
      }
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={company ? company.name : 'Nouvelle entreprise'}>
      <form className="modal__form" onSubmit={(event) => void submit(event)}>
        {error ? (
          <p className="auth__alert" role="alert">
            {error}
          </p>
        ) : null}
        <Field label="Nom" htmlFor="co-name">
          <Input
            id="co-name"
            required
            maxLength={200}
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Domaine" htmlFor="co-domain" hint="ex. exemple.com">
            <Input
              id="co-domain"
              maxLength={255}
              value={form.domain}
              onChange={(event) => set('domain', event.target.value)}
            />
          </Field>
          <Field label="Secteur" htmlFor="co-industry">
            <Input
              id="co-industry"
              maxLength={100}
              value={form.industry}
              onChange={(event) => set('industry', event.target.value)}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Téléphone" htmlFor="co-phone">
            <Input
              id="co-phone"
              maxLength={40}
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
            />
          </Field>
          <Field label="Site web" htmlFor="co-website" hint="https://…">
            <Input
              id="co-website"
              maxLength={2048}
              value={form.website}
              onChange={(event) => set('website', event.target.value)}
            />
          </Field>
        </div>
        <Field label="Adresse" htmlFor="co-address">
          <Input
            id="co-address"
            maxLength={255}
            value={form.addressLine}
            onChange={(event) => set('addressLine', event.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Ville" htmlFor="co-city">
            <Input
              id="co-city"
              maxLength={120}
              value={form.city}
              onChange={(event) => set('city', event.target.value)}
            />
          </Field>
          <Field label="Pays" htmlFor="co-country" hint="Code ISO sur 2 lettres (BJ, FR, CA…)">
            <Input
              id="co-country"
              maxLength={2}
              value={form.country}
              onChange={(event) => set('country', event.target.value.toUpperCase())}
            />
          </Field>
        </div>
        <Field label="Notes" htmlFor="co-notes">
          <Textarea
            id="co-notes"
            rows={3}
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
          />
        </Field>
        <div className="modal__foot">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" loading={saving} disabled={!form.name.trim()}>
            {company ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
