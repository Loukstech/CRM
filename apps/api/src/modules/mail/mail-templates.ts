import type { MailMessage } from './mailer.interface';

const TITLES: Record<MailMessage['template'], string> = {
  'email-verification': 'Vérifiez votre adresse e-mail',
  'password-reset': 'Réinitialisation de votre mot de passe',
  'organization-invitation': 'Invitation à rejoindre une organisation',
};

const ACTION_LABELS: Record<MailMessage['template'], string> = {
  'email-verification': 'Vérifier mon adresse',
  'password-reset': 'Réinitialiser le mot de passe',
  'organization-invitation': 'Rejoindre l’organisation',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Rend un `MailMessage` en texte et en HTML. Les variables (notamment `url`)
 * sont échappées pour éviter toute injection HTML.
 */
export function renderMail(message: MailMessage): { html: string; text: string } {
  const title = TITLES[message.template] ?? message.subject;
  const vars = message.variables ?? {};
  const url = vars['url'];
  const safeUrl = url ? escapeHtml(url) : undefined;
  const actionLabel = escapeHtml(ACTION_LABELS[message.template] ?? 'Ouvrir le lien');

  const buttonHtml = safeUrl
    ? `<p style="margin:24px 0;"><a href="${safeUrl}" style="background:#4f46e5;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">${actionLabel}</a></p>`
    : '';

  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(title)}</h1>
    <p style="color:#3f3f46;line-height:1.5;margin:0;">${escapeHtml(message.subject)}</p>
    ${buttonHtml}
    ${
      safeUrl
        ? `<p style="color:#71717a;font-size:12px;word-break:break-all;">Si le bouton ne fonctionne pas, copiez ce lien : ${safeUrl}</p>`
        : ''
    }
  </div>
</body>
</html>`;

  const text = [title, '', message.subject, safeUrl ? `\nLien : ${url}` : ''].join('\n');

  return { html, text };
}
