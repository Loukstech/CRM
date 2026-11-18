import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, MailCheck } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Input, PasswordInput, Select } from '../components/ui';
import '../styles/auth.css';

function AuthLayout({
  title,
  subtitle,
  children,
  foot,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="auth">
      <aside className="auth__aside">
        <div className="brand">
          <span className="brand__mark">L</span>
          <span className="brand__name">
            Louk's<span> CRM</span>
          </span>
        </div>
        <div>
          <h2 className="auth__statement">
            Le commerce, <em>en ordre.</em>
          </h2>
          <p className="auth__caption">
            Un espace unique pour votre équipe, vos organisations et vos accès. Clair, rapide, sans détour.
          </p>
        </div>
        <div className="auth__aside-foot">ESPACE DE TRAVAIL — CRM</div>
      </aside>
      <main className="auth__main">
        <div className="auth__panel">
          <div className="auth__panel-head">
            <div className="rule-brass" />
            <h1 className="display">{title}</h1>
            <p>{subtitle}</p>
          </div>
          {children}
          {foot ? <div className="auth__foot">{foot}</div> : null}
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await api.login(email, password);
      await signIn(session);
      navigate('/', { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Bon retour."
      subtitle="Connectez-vous à votre espace de travail."
      foot={
        <>
          Pas encore de compte ? <Link to="/register">Créer un compte</Link>
        </>
      }
    >
      <form className="auth__form" onSubmit={submit}>
        {error ? (
          <div className="auth__alert" role="alert">
            {error}
          </div>
        ) : null}
        <Field label="Adresse e-mail" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            placeholder="vous@entreprise.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Mot de passe" htmlFor="password">
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            placeholder="Votre mot de passe"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <div className="auth__links">
          <Link to="/forgot-password">Mot de passe oublié ?</Link>
        </div>
        <Button type="submit" full loading={loading} icon={<ArrowRight size={16} />}>
          Se connecter
        </Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    organizationName: '',
    country: 'BJ',
    currency: 'XOF',
    timezone: 'Africa/Porto-Novo',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const session = await api.register(form);
      await signIn(session);
      navigate('/', { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Commencer."
      subtitle="Créez votre compte et votre première organisation."
      foot={
        <>
          Déjà inscrit ? <Link to="/login">Se connecter</Link>
        </>
      }
    >
      <form className="auth__form" onSubmit={submit}>
        {error ? (
          <div className="auth__alert" role="alert">
            {error}
          </div>
        ) : null}
        <Field label="Votre nom" htmlFor="name">
          <Input id="name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Adresse e-mail" htmlFor="reg-email">
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>
        <Field label="Mot de passe" htmlFor="reg-password" hint="Au moins 12 caractères.">
          <PasswordInput
            id="reg-password"
            autoComplete="new-password"
            required
            minLength={12}
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
          />
        </Field>
        <Field
          label="Confirmer le mot de passe"
          htmlFor="reg-confirm-password"
          hint="Retapez exactement le même mot de passe."
        >
          <PasswordInput
            id="reg-confirm-password"
            autoComplete="new-password"
            required
            minLength={12}
            value={form.confirmPassword}
            onChange={(e) => set('confirmPassword', e.target.value)}
          />
        </Field>
        <Field label="Nom de l'organisation" htmlFor="org">
          <Input
            id="org"
            required
            value={form.organizationName}
            onChange={(e) => set('organizationName', e.target.value)}
          />
        </Field>
        <div className="auth__row">
          <Field label="Pays" htmlFor="country">
            <Select id="country" value={form.country} onChange={(e) => set('country', e.target.value)}>
              <option value="BJ">Bénin</option>
              <option value="FR">France</option>
              <option value="CI">Côte d'Ivoire</option>
              <option value="SN">Sénégal</option>
              <option value="TG">Togo</option>
            </Select>
          </Field>
          <Field label="Devise" htmlFor="currency">
            <Select id="currency" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              <option value="XOF">XOF — franc CFA</option>
              <option value="EUR">EUR — euro</option>
              <option value="USD">USD — dollar</option>
            </Select>
          </Field>
        </div>
        <Button type="submit" full loading={loading} icon={<ArrowRight size={16} />}>
          Créer mon espace
        </Button>
      </form>
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('Ce lien ne contient pas de jeton de vérification.');
      return;
    }
    let active = true;
    api
      .verifyEmail(token)
      .then(() => active && setState('done'))
      .catch((cause: unknown) => {
        if (!active) return;
        setState('error');
        setMessage(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <AuthLayout title="Vérification" subtitle="Confirmation de votre adresse e-mail.">
      <div className="auth-state">
        <div className="auth-state__mark">
          {state === 'loading' ? (
            <MailCheck size={24} />
          ) : state === 'done' ? (
            <Check size={26} />
          ) : (
            <span>!</span>
          )}
        </div>
        <h1 className="display">
          {state === 'loading' ? 'Un instant…' : state === 'done' ? 'Adresse confirmée.' : 'Lien invalide.'}
        </h1>
        <p>
          {state === 'loading'
            ? 'Nous vérifions votre jeton.'
            : state === 'done'
              ? 'Votre adresse e-mail est vérifiée. Vous pouvez retourner dans votre espace.'
              : message}
        </p>
        {state !== 'loading' ? (
          <Link to="/login">
            <Button icon={<ArrowRight size={16} />}>Aller à la connexion</Button>
          </Link>
        ) : null}
      </div>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Réinitialiser."
      subtitle="Nous vous enverrons un lien de réinitialisation."
      foot={<Link to="/login">Retour à la connexion</Link>}
    >
      {sent ? (
        <div className="auth__note">
          Si un compte existe pour <strong>{email}</strong>, un lien vient de partir. Vérifiez votre boîte de
          réception.
        </div>
      ) : (
        <form className="auth__form" onSubmit={submit}>
          {error ? (
            <div className="auth__alert" role="alert">
              {error}
            </div>
          ) : null}
          <Field label="Adresse e-mail" htmlFor="forgot-email">
            <Input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vous@entreprise.com"
            />
          </Field>
          <Button type="submit" full loading={loading}>
            Envoyer le lien
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      navigate('/login', { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Nouveau mot de passe" subtitle="Choisissez un mot de passe sûr.">
      <form className="auth__form" onSubmit={submit}>
        {error ? (
          <div className="auth__alert" role="alert">
            {error}
          </div>
        ) : null}
        <Field label="Nouveau mot de passe" htmlFor="reset-password" hint="Au moins 12 caractères.">
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label="Confirmer" htmlFor="reset-confirm">
          <PasswordInput
            id="reset-confirm"
            autoComplete="new-password"
            required
            minLength={12}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        <Button type="submit" full loading={loading} disabled={!token}>
          Enregistrer
        </Button>
      </form>
    </AuthLayout>
  );
}

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { status, signIn, refresh, switchOrganization } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [form, setForm] = useState({
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
  });
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!token) {
      setPhase('error');
      setMessage('Ce lien ne contient pas de jeton d’invitation.');
    }
  }, [token]);

  async function finish(organizationId?: string) {
    if (organizationId) await switchOrganization(organizationId);
    else await refresh();
    setPhase('done');
    setMessage('Vous avez rejoint l’organisation. Elle est maintenant active.');
  }

  async function acceptAuthenticated() {
    setPhase('loading');
    setMessage('');
    try {
      const result = await api.acceptInvitation(token);
      await finish(result.organizationId);
    } catch (cause) {
      setPhase('error');
      setMessage(errorMessage(cause));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPhase('loading');
    setMessage('');
    try {
      if (mode === 'login') {
        const session = await api.login(form.email, form.password);
        await signIn(session);
        const result = await api.acceptInvitation(token);
        await finish(result.organizationId);
      } else {
        if (form.password !== form.confirmPassword) {
          throw new Error('Les mots de passe ne correspondent pas.');
        }
        const session = await api.acceptInvitationSignup({
          token,
          name: form.name,
          password: form.password,
        });
        await signIn(session);
        await finish();
      }
    } catch (cause) {
      setPhase('error');
      setMessage(errorMessage(cause));
    }
  }

  if (phase === 'done') {
    return (
      <AuthLayout
        title="C'est prêt."
        subtitle="Votre invitation a été acceptée."
        foot={
          <>
            <Link to="/">Aller à l’espace de travail</Link>
          </>
        }
      >
        <div className="auth__alert" role="status">
          {message}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Rejoindre l'organisation"
      subtitle="Acceptez l’invitation pour accéder à l’espace partagé."
    >
      {phase === 'error' ? (
        <div className="auth__alert" role="alert">
          {message || 'Ce lien d’invitation est invalide.'}
        </div>
      ) : null}
      {status === 'authenticated' ? (
        <div className="auth__form">
          <p className="muted">
            Vous êtes connecté. Confirmez pour rejoindre l’organisation associée à cette invitation.
          </p>
          <Button
            type="button"
            full
            loading={phase === 'loading'}
            icon={<Check size={16} />}
            onClick={acceptAuthenticated}
          >
            Accepter l’invitation
          </Button>
        </div>
      ) : (
        <>
          <div className="auth__links">
            <Button
              type="button"
              variant={mode === 'login' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setMode('login')}
            >
              J’ai déjà un compte
            </Button>
            <Button
              type="button"
              variant={mode === 'signup' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setMode('signup')}
            >
              Créer un compte
            </Button>
          </div>
          <form className="auth__form" onSubmit={submit}>
            {mode === 'signup' ? (
              <Field label="Votre nom" htmlFor="invite-name">
                <Input
                  id="invite-name"
                  required
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                />
              </Field>
            ) : (
              <Field label="Adresse e-mail" htmlFor="invite-email">
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={(event) => set('email', event.target.value)}
                />
              </Field>
            )}
            <Field label="Mot de passe" htmlFor="invite-password" hint="Au moins 12 caractères.">
              <PasswordInput
                id="invite-password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={12}
                value={form.password}
                onChange={(event) => set('password', event.target.value)}
              />
            </Field>
            {mode === 'signup' ? (
              <Field label="Confirmer le mot de passe" htmlFor="invite-confirm">
                <PasswordInput
                  id="invite-confirm"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={form.confirmPassword}
                  onChange={(event) => set('confirmPassword', event.target.value)}
                />
              </Field>
            ) : null}
            <Button type="submit" full loading={phase === 'loading'} icon={<ArrowRight size={16} />}>
              {mode === 'login' ? 'Se connecter et accepter' : 'Créer mon compte et accepter'}
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
