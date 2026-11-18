import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Card } from './ui';
import { errorMessage } from '../lib/api';

/**
 * Charge une ressource asynchrone et expose ses trois états.
 * `deps` doit lister les valeurs dont dépend le chargement.
 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);
  const reload = useCallback(() => {
    setLoading(true);
    setError('');
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

/** États chargement / erreur, pour ne jamais afficher une liste vide par accident. */
export function State({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  if (loading) return <Card className="card__body muted">Chargement…</Card>;
  if (error) return <Card className="card__body auth__alert">{error}</Card>;
  return <>{children}</>;
}
