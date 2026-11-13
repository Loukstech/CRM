import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { Mailer, type MailMessage } from './mailer.interface';
import { SmtpMailer } from './smtp-mailer';

export { Mailer, type MailMessage } from './mailer.interface';

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

/**
 * Résout le connecteur d'envoi réel selon `MAIL_DRIVER` :
 * - `log`  → journalise dans la console (développement) ;
 * - `smtp` → envoie via le serveur SMTP configuré (ex. Hostinger).
 *
 * La validation de configuration (config/env.ts) garantit qu'on n'accepte pas
 * `log` en production, et qu'un pilote `smtp` a bien ses paramètres.
 */
function createMailer(config: AppConfig): Mailer {
  if (config.NODE_ENV === 'production' && config.MAIL_DRIVER === 'log') {
    throw new Error("MAIL_DRIVER 'log' interdit en production : utilisez 'smtp'.");
  }
  return config.MAIL_DRIVER === 'smtp' ? new SmtpMailer(config) : new LogMailer();
}

@Global()
@Module({
  providers: [{ provide: Mailer, useFactory: createMailer, inject: [APP_CONFIG] }],
  exports: [Mailer],
})
export class MailModule {}
