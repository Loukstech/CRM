import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { Mailer, type MailMessage } from './mailer.interface';
import { renderMail } from './mail-templates';

type Provider = 'brevo' | 'resend';

interface Sender {
  name: string;
  email: string;
}

/** `CRM <contact@exemple.com>` ou `contact@exemple.com`. */
export function parseSender(raw: string): Sender {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  if (match) {
    const name = match[1] ?? '';
    const email = (match[2] ?? '').trim();
    return { name: name || email, email };
  }
  const email = raw.trim();
  return { name: email, email };
}

/**
 * Adaptateur d'envoi via une API HTTP (Brevo, Resend), sur le port 443.
 *
 * Pourquoi ce pilote existe : certains hébergeurs bloquent les ports SMTP
 * sortants (25, 465, 587). C'est le cas des instances **Free** de Render,
 * documenté dans https://render.com/docs/free — un `MAIL_DRIVER=smtp` y échoue
 * systématiquement par « Connection timeout ». Passer par HTTPS contourne le
 * blocage et améliore la délivrabilité (SPF/DKIM gérés par le fournisseur).
 *
 * Sélectionné quand `MAIL_DRIVER=http`. Paramètres : `MAIL_HTTP_PROVIDER`,
 * `MAIL_HTTP_API_KEY`, et `MAIL_FROM` (expéditeur authentifié chez le fournisseur).
 */
@Injectable()
export class HttpMailer extends Mailer {
  private readonly logger = new Logger('HttpMailer');
  private readonly provider: Provider;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly sender: Sender;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
    const { MAIL_HTTP_PROVIDER, MAIL_HTTP_API_KEY, MAIL_HTTP_ENDPOINT, MAIL_FROM } = config;
    if (!MAIL_HTTP_PROVIDER || !MAIL_HTTP_API_KEY || !MAIL_FROM) {
      throw new Error(
        "Configuration e-mail incomplète : MAIL_HTTP_PROVIDER, MAIL_HTTP_API_KEY et MAIL_FROM sont requis quand MAIL_DRIVER='http'.",
      );
    }
    this.provider = MAIL_HTTP_PROVIDER;
    this.apiKey = MAIL_HTTP_API_KEY;
    this.endpoint =
      MAIL_HTTP_ENDPOINT ??
      (this.provider === 'brevo' ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails');
    this.sender = parseSender(MAIL_FROM);
  }

  async send(message: MailMessage): Promise<void> {
    const { html, text } = renderMail(message);
    const { url, headers, body } = this.buildRequest(message, html, text);

    // Un seul réessai, uniquement sur 429 / 5xx : ces erreurs sont transitoires.
    let lastError = '';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      }).catch((error: unknown) => {
        lastError = error instanceof Error ? error.message : String(error);
        return undefined;
      });

      if (!response) {
        if (attempt === 2) break;
        await this.backoff(attempt);
        continue;
      }

      if (response.ok) {
        this.logger.log(
          `E-mail envoyé à=${message.to} gabarit=${message.template} fournisseur=${this.provider}`,
        );
        return;
      }

      const detail = (await response.text().catch(() => '')).slice(0, 300);
      lastError = `HTTP ${response.status} — ${detail}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 2) break;
      await this.backoff(attempt);
    }

    throw new Error(`Envoi ${this.provider} impossible : ${lastError}`);
  }

  private buildRequest(
    message: MailMessage,
    html: string,
    text: string,
  ): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    if (this.provider === 'brevo') {
      return {
        url: this.endpoint,
        headers: {
          'api-key': this.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: {
          sender: this.sender,
          to: [{ email: message.to }],
          subject: message.subject,
          htmlContent: html,
          textContent: text,
        },
      };
    }

    // Resend : `from` accepte directement la forme « Nom <adresse> ».
    return {
      url: this.endpoint,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: {
        from:
          this.sender.name === this.sender.email
            ? this.sender.email
            : `${this.sender.name} <${this.sender.email}>`,
        to: [message.to],
        subject: message.subject,
        html,
        text,
      },
    };
  }

  private async backoff(attempt: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
}
