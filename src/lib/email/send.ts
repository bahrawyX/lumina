import 'server-only';

import { logger } from '@/lib/logger';

/**
 * Transactional email.
 *
 * ## Why this exists
 *
 * Three findings all reduced to "this app cannot send an email":
 *
 *  - **F3.6** — `/request-password-reset` throws `400 RESET_PASSWORD_DISABLED`
 *    before doing anything, because `emailAndPassword.sendResetPassword` is
 *    unset. A user who forgets their password, or suspects it is compromised,
 *    has no recovery and no rotation path.
 *  - **F3.4** — password sign-up hard-codes `emailVerified: false`, nothing
 *    ever flips it, and BetterAuth's account linker defaults
 *    `requireLocalEmailVerified: true`. Without a verification flow the flag is
 *    false forever.
 *  - **P1-7** — implicit social linking into an unverified same-email account
 *    is an account-takeover path. Verification is the clean fix.
 *
 * ## Configuration
 *
 * Set `RESEND_API_KEY` and `EMAIL_FROM`. Nothing else is required — this speaks
 * the Resend HTTP API directly rather than adding an SDK, because it is one
 * `fetch` and the app already has enough dependencies it does not use.
 *
 * **When unconfigured**, `sendMail` logs the message (including the link, in
 * development only) and reports failure. It never throws. That is deliberate:
 * the alternative is either crashing at boot in every environment without mail,
 * or silently pretending an email was delivered. The auth config reads
 * `isEmailConfigured()` and only turns on the flows that need mail when mail
 * actually works, so an unconfigured deployment degrades to today's behaviour
 * rather than locking every user out of registration.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always sent — some clients and all screen readers use it. */
  text: string;
  /** Optional HTML body. */
  html?: string;
}

/**
 * True when a real provider is configured.
 *
 * `src/lib/auth.ts` gates `requireEmailVerification` on this: turning
 * verification on without a way to send the verification email would make
 * registration impossible.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Send one message. Returns whether it was accepted by the provider.
 *
 * Never throws — a mail failure must not take down the auth route that
 * triggered it. Callers that care log the `false`.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    logger.warn('email not configured; message not sent', {
      route: 'lib/email',
      subject: message.subject,
      // Never log the recipient in production — it is personal data. In
      // development the whole point is to be able to click the link.
      ...(process.env.NODE_ENV === 'development'
        ? { to: message.to, body: message.text }
        : {}),
    });
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      logger.error('email provider rejected the message', {
        route: 'lib/email',
        status: res.status,
        subject: message.subject,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.error('email send failed', { route: 'lib/email', subject: message.subject }, err);
    return false;
  }
}

/** Shared plain-text frame, so every message reads like it came from the app. */
function frame(body: string, actionUrl: string, actionLabel: string): string {
  return [
    body,
    '',
    `${actionLabel}:`,
    actionUrl,
    '',
    'If you did not request this, you can safely ignore this email.',
    '',
    '— Lumina',
  ].join('\n');
}

export async function sendVerificationMail(to: string, url: string, name?: string): Promise<boolean> {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return sendMail({
    to,
    subject: 'Verify your email for Lumina',
    text: frame(
      `${greeting}\n\nConfirm this address to finish setting up your Lumina account.`,
      url,
      'Verify your email',
    ),
  });
}

export async function sendPasswordResetMail(to: string, url: string, name?: string): Promise<boolean> {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return sendMail({
    to,
    subject: 'Reset your Lumina password',
    text: frame(
      `${greeting}\n\nSomeone asked to reset the password for this Lumina account. The link below expires shortly and can be used once.`,
      url,
      'Choose a new password',
    ),
  });
}
