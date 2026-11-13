/**
 * Contrat de port d'envoi d'e-mails. Les modules métier dépendent de `Mailer`
 * (et non d'un adaptateur concret) ; le connecteur réel est choisi au démarrage
 * selon `MAIL_DRIVER` (voir mail.module.ts).
 */
export interface MailMessage {
  to: string;
  /** Identifiant du gabarit ; le rendu HTML/texte vient de mail-templates.ts. */
  template: 'email-verification' | 'password-reset' | 'organization-invitation';
  subject: string;
  /** Variables du gabarit (liens d'action…). */
  variables: Record<string, string>;
}

export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}
