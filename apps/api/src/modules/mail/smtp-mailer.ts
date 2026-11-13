import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { Mailer, type MailMessage } from './mailer.interface';
import { renderMail } from './mail-templates';

/**
 * Adaptateur d'envoi réel via SMTP (Hostinger, Gmail, Resend SMTP, etc.).
 * Sélectionné quand `MAIL_DRIVER=smtp`. Les paramètres viennent de la
 * configuration (MAIL_HOST/PORT/USER/PASSWORD/FROM), validés en production.
 */
@Injectable()
export class SmtpMailer extends Mailer {
  private readonly logger = new Logger('SmtpMailer');
  private readonly transporter: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
    const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASSWORD, MAIL_FROM } = config;
    if (!MAIL_HOST || !MAIL_PORT || !MAIL_USER || !MAIL_PASSWORD || !MAIL_FROM) {
      throw new Error(
        "Configuration SMTP incomplète : MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASSWORD et MAIL_FROM sont requis quand MAIL_DRIVER='smtp'.",
      );
    }
    this.transporter = nodemailer.createTransport({
      host: MAIL_HOST,
      port: MAIL_PORT,
      secure: MAIL_PORT === 465,
      auth: { user: MAIL_USER, pass: MAIL_PASSWORD },
    });
  }

  async send(message: MailMessage): Promise<void> {
    const { html, text } = renderMail(message);
    await this.transporter.sendMail({
      from: this.config.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text,
      html,
    });
    this.logger.log(`E-mail envoyé à=${message.to} gabarit=${message.template}`);
  }
}
