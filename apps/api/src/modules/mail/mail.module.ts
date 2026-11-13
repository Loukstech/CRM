import { Global, Injectable, Logger, Module } from '@nestjs/common';

export interface MailMessage {
  to: string;
  /** Identifiant du gabarit ; le rendu HTML/texte viendra avec un vrai connecteur. */
  template: 'email-verification' | 'password-reset' | 'organization-invitation';
  subject: string;
  /** Variables du gabarit (liens d'action…). */
  variables: Record<string, string>;
}

/**
 * Port d'envoi d'e-mails. Les modules dépendent de cette abstraction ; le
 * connecteur réel (SMTP, Resend…) sera un adaptateur ajouté en phase 5.
 */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

/**
 * Adaptateur de DÉVELOPPEMENT : n'envoie AUCUN e-mail.
 * Il écrit le message (liens compris) dans la console pour permettre de
 * tester les parcours en local. La configuration interdit ce pilote en
 * production (voir config/env.ts).
 */
@Injectable()
export class LogMailer extends Mailer {
  private readonly logger = new Logger('LogMailer');

  async send(message: MailMessage): Promise<void> {
    this.logger.warn(
      `[E-MAIL NON ENVOYÉ — pilote "log"] à=${message.to} gabarit=${message.template} ` +
        `sujet="${message.subject}" variables=${JSON.stringify(message.variables)}`,
    );
  }
}

@Global()
@Module({
  providers: [{ provide: Mailer, useClass: LogMailer }],
  exports: [Mailer],
})
export class MailModule {}
