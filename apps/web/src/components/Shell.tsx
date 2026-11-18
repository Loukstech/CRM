import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  Check,
  ChevronDown,
  Contact,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  ScrollText,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Avatar, Button, useToast } from '../components/ui';
import '../styles/app.css';

const NAV = [
  { to: '/', label: 'Vue d’ensemble', icon: LayoutDashboard, end: true },
  { to: '/contacts', label: 'Contacts', icon: Contact, end: false },
  { to: '/entreprises', label: 'Entreprises', icon: Building2, end: false },
  { to: '/equipe', label: 'Équipe', icon: Users, end: false },
  { to: '/invitations', label: 'Invitations', icon: Mail, end: false },
  { to: '/acces', label: 'Rôles & accès', icon: ShieldCheck, end: false },
  { to: '/audit', label: 'Journal d’activité', icon: ScrollText, end: false },
  { to: '/organisation', label: 'Organisation', icon: Settings2, end: false },
];

const TITLES: Record<string, string> = {
  '/': 'Vue d’ensemble',
  '/contacts': 'Contacts',
  '/entreprises': 'Entreprises',
  '/equipe': 'Équipe',
  '/invitations': 'Invitations',
  '/acces': 'Rôles & accès',
  '/audit': 'Journal d’activité',
  '/organisation': 'Organisation',
};

function Brand() {
  return (
    <div className="brand">
      <span className="brand__mark">L</span>
      <span className="brand__name">
        Louk's<span> CRM</span>
      </span>
    </div>
  );
}

export function Shell() {
  const { me, signOut, switchOrganization, refresh } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [orgMenu, setOrgMenu] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setOpen(false);
    setOrgMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!orgMenu) return;
    const close = () => setOrgMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [orgMenu]);

  const activeOrg = me?.organizations.find((org) => org.id === me.active?.organizationId);

  async function resend() {
    setSending(true);
    try {
      await api.resendVerification();
      notify('E-mail de vérification envoyé.');
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    } finally {
      setSending(false);
    }
  }

  async function logout() {
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    }
  }

  async function selectOrg(id: string) {
    setOrgMenu(false);
    if (id === activeOrg?.id) return;
    try {
      await switchOrganization(id);
      await refresh();
      notify('Organisation active changée.');
    } catch (cause) {
      notify(errorMessage(cause), 'error');
    }
  }

  return (
    <div className="shell">
      <div className={`drawer-overlay${open ? ' visible' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`rail${open ? ' open' : ''}`}>
        <div className="rail__brand">
          <Brand />
          <button className="icon-btn rail__close" onClick={() => setOpen(false)} aria-label="Fermer le menu">
            <X size={18} />
          </button>
        </div>
        <nav className="rail__group" aria-label="Navigation principale">
          <p className="rail__label">Espace de travail</p>
          {NAV.slice(0, 5).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
          <p className="rail__label">Paramètres</p>
          {NAV.slice(5).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="rail__foot">
          Louk's CRM
          <br />
          Espace multi-tenant
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__left">
            <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
              <Menu size={20} />
            </button>
            <div className="topbar__crumb">
              Espace <strong>{TITLES[location.pathname] ?? "Louk's CRM"}</strong>
            </div>
          </div>
          <div className="topbar__right">
            <div className="org-switch" onMouseDown={(event) => event.stopPropagation()}>
              <button
                className="org-switch__btn"
                onClick={() => setOrgMenu((value) => !value)}
                aria-expanded={orgMenu}
              >
                <span className="org-switch__dot" />
                <span className="truncate">{activeOrg?.name ?? 'Aucune organisation'}</span>
                <ChevronDown size={14} />
              </button>
              {orgMenu ? (
                <div className="org-menu" role="menu">
                  {me?.organizations.map((org) => (
                    <button
                      key={org.id}
                      className={`org-menu__item${org.id === activeOrg?.id ? ' active' : ''}`}
                      onClick={() => void selectOrg(org.id)}
                      role="menuitem"
                    >
                      <span>{org.name}</span>
                      {org.id === activeOrg?.id ? <Check size={14} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="user-chip">
              <Avatar name={me?.user.name ?? '?'} size="sm" />
              <div>
                <div className="user-chip__name">{me?.user.name}</div>
                <div className="user-chip__mail">{me?.user.email}</div>
              </div>
              <button
                className="icon-btn"
                onClick={() => void logout()}
                aria-label="Se déconnecter"
                title="Se déconnecter"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {me && !me.user.emailVerified ? (
          <div className="notice">
            <span>
              <strong>Votre adresse n’est pas encore vérifiée.</strong> Certaines actions, comme créer une
              autre organisation, restent indisponibles.
            </span>
            <Button variant="secondary" size="sm" loading={sending} onClick={() => void resend()}>
              Renvoyer l’e-mail
            </Button>
          </div>
        ) : null}

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
