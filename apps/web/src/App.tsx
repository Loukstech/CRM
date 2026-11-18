import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './components/ui';
import { Shell } from './components/Shell';
import {
  AcceptInvitationPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/Auth';
import {
  AccessPage,
  AuditPage,
  DashboardPage,
  InvitationsPage,
  OrganizationPage,
  TeamPage,
} from './pages/App';
import { CompaniesPage, ContactsPage } from './pages/Crm';

function Splash() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', gap: 12 }}>
      <div className="brand__mark">L</div>
      <span className="muted" style={{ fontSize: 12 }}>
        Chargement…
      </span>
    </div>
  );
}

function Protected() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return <Shell />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnly>
                  <LoginPage />
                </PublicOnly>
              }
            />
            <Route
              path="/register"
              element={
                <PublicOnly>
                  <RegisterPage />
                </PublicOnly>
              }
            />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route element={<Protected />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/entreprises" element={<CompaniesPage />} />
              <Route path="/equipe" element={<TeamPage />} />
              <Route path="/invitations" element={<InvitationsPage />} />
              <Route path="/acces" element={<AccessPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="/organisation" element={<OrganizationPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}
