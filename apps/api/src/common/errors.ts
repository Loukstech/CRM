import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { currentRequestMeta } from './request-context';

/**
 * Erreur métier avec code stable, exploitable par les clients web et mobile.
 * Format de réponse : { error: { code, message, details?, requestId } }
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, status);
  }

  static badRequest(code: string, message: string, details?: unknown): AppError {
    return new AppError(HttpStatus.BAD_REQUEST, code, message, details);
  }
  static unauthenticated(code = 'UNAUTHENTICATED', message = 'Authentification requise.'): AppError {
    return new AppError(HttpStatus.UNAUTHORIZED, code, message);
  }
  static forbidden(code = 'FORBIDDEN', message = 'Action non autorisée.'): AppError {
    return new AppError(HttpStatus.FORBIDDEN, code, message);
  }
  static notFound(message = 'Ressource introuvable.'): AppError {
    return new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', message);
  }
  static conflict(code: string, message: string): AppError {
    return new AppError(HttpStatus.CONFLICT, code, message);
  }
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

interface ErrorBody {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

function toErrorBody(exception: unknown): ErrorBody {
  if (exception instanceof AppError) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const code = DEFAULT_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR');
    // ValidationPipe renvoie { message: string[] }.
    if (typeof response === 'object' && response !== null && 'message' in response) {
      const message: unknown = response.message;
      if (Array.isArray(message)) {
        return { status, code: 'VALIDATION_ERROR', message: 'Données invalides.', details: message };
      }
      if (typeof message === 'string') return { status, code, message };
    }
    return { status, code, message: status === 429 ? 'Trop de requêtes.' : exception.message };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    // Filet de sécurité : les services traitent normalement ces cas eux-mêmes.
    if (exception.code === 'P2002') {
      return { status: 409, code: 'CONFLICT', message: 'Cette valeur est déjà utilisée.' };
    }
    if (exception.code === 'P2025') {
      return { status: 404, code: 'NOT_FOUND', message: 'Ressource introuvable.' };
    }
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'Erreur interne.' };
}

/** Normalise toutes les erreurs et ne divulgue jamais de détail interne. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { requestId } = currentRequestMeta();
    const body = toErrorBody(exception);

    if (body.status >= 500) {
      this.logger.error(
        `[${requestId}] ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`,
      );
    }

    response.status(body.status).json({
      error: {
        code: body.code,
        message: body.message,
        ...(body.details !== undefined ? { details: body.details } : {}),
        requestId,
      },
    });
  }
}
