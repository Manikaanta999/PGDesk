export interface TransactionalEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function isEmailDeliveryConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase() === 'false') {
    return false;
  }
  const hasResend = Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.trim().length > 0);
  const hasWebhook = Boolean(env.EMAIL_WEBHOOK_URL && env.EMAIL_WEBHOOK_URL.trim().length > 0);
  return hasResend || hasWebhook;
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput
): Promise<{ sent: boolean; channel: 'resend' | 'webhook' | 'console' }> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.EMAIL_FROM?.trim() || 'PGDesk <noreply@pgdesk.in>';

  if (resendKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      });
      if (resp.ok) {
        return { sent: true, channel: 'resend' };
      }
      console.error('Resend email delivery failed:', resp.status, await resp.text().catch(() => ''));
    } catch (err) {
      console.error('Resend email delivery error:', err);
    }
  }

  const webhookUrl = process.env.EMAIL_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.EMAIL_WEBHOOK_SECRET
            ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_SECRET.trim()}` }
            : {}),
        },
        body: JSON.stringify({
          from: fromEmail,
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      });
      if (resp.ok) {
        return { sent: true, channel: 'webhook' };
      }
      console.error('Webhook email delivery failed:', resp.status);
    } catch (err) {
      console.error('Webhook email delivery error:', err);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info(`[PGDesk Email Fallback] To: ${input.to} | Subject: ${input.subject}`);
  }
  return { sent: false, channel: 'console' };
}
