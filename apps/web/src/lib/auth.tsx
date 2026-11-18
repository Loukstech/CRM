import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore, type Me, type Session } from './api';

type AuthState = {
  status: 'loading' | 'authenticated' | 'anonymous';
  me: Me | null;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  switchOrganization: (id: string) => Promise<void>;
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    if (!tokenStore.read()) {
      setMe(null);
      setStatus('anonymous');
      return;
    }
    try {
      setMe(await api.me());
      setStatus('authenticated');
    } catch {
      tokenStore.clear();
      setMe(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (session: Session) => {
      tokenStore.write(session.tokens);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api.logout();
    setMe(null);
    setStatus('anonymous');
  }, []);

  const switchOrganization = useCallback(
    async (id: string) => {
      await api.switchOrganization(id);
      await refresh();
    },
    [refresh],
  );

  const can = useCallback(
    (permission: string) => Boolean(me?.active?.permissions.some((p) => p.key === permission)),
    [me],
  );

  const value = useMemo<AuthState>(
    () => ({ status, me, signIn, signOut, refresh, switchOrganization, can }),
    [status, me, signIn, signOut, refresh, switchOrganization, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return context;
}
