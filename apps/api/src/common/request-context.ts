import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Métadonnées techniques de la requête, utilisées par l'audit et les logs. */
export interface RequestMeta {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestMeta>();

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Middleware : identifiant de corrélation + contexte asynchrone de la requête. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', requestId);

  const meta: RequestMeta = {
    requestId,
    ip: req.ip ?? null,
    userAgent: req.header('user-agent')?.slice(0, 512) ?? null,
  };
  storage.run(meta, next);
}

export function currentRequestMeta(): RequestMeta {
  return storage.getStore() ?? { requestId: 'no-request', ip: null, userAgent: null };
}
