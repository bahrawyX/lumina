import Link from 'next/link';
import { isEmailConfigured } from '@/lib/email/send';
import { ForgotPasswordForm } from './ForgotPasswordForm';

/**
 * Password reset, or an honest explanation that it is not available yet.
 *
 * Without `RESEND_API_KEY` / `EMAIL_FROM` there is no way to send the link, and
 * the form did not say so. It accepted an address, reported "Check your email",
 * and named the address back to the user — a screen deliberately worded to be
 * identical whether or not the account exists, so that it gives away nothing.
 * That is right when a mail actually went out, and badly wrong when none did:
 * the one person it misleads is the real user, who then waits for a message
 * that was never sent, checks their spam folder, and concludes they used a
 * different address.
 *
 * This is a server component so it can read the same server-side
 * `isEmailConfigured()` that gates `requireEmailVerification` and
 * `sendOnSignUp` in `src/lib/auth.ts`. One source of truth, and setting the two
 * environment variables turns the real form back on with no code change — there
 * is no separate feature flag to remember to flip, and no `NEXT_PUBLIC_` mirror
 * of a secret's presence.
 *
 * The "Forgot your password?" link on the sign-in page is deliberately left in
 * place. Removing it would leave someone who cannot get in with no explanation
 * at all; sending them here tells them why and what to do instead.
 */
export default function ForgotPasswordPage() {
  if (isEmailConfigured()) {
    return <ForgotPasswordForm />;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-[400px] space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Coming soon
          </p>
          <h1 className="font-display text-2xl font-medium tracking-[-0.03em]">
            Password reset isn&rsquo;t available yet
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We can&rsquo;t email you a reset link at the moment. Rather than take your
            address and leave you waiting for a message that never arrives, here are the
            ways back into your account today.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
          <p className="text-sm text-foreground">
            <span className="font-medium">Sign in with Google or Microsoft.</span>{' '}
            <span className="text-muted-foreground">
              If you first signed up with either, that still works and needs no password.
            </span>
          </p>
          <p className="text-sm text-foreground">
            <span className="font-medium">Password-only account?</span>{' '}
            <span className="text-muted-foreground">
              Email reset is coming shortly. Your account and everything in it are
              safe in the meantime.
            </span>
          </p>
        </div>

        {/*
          No support link here on purpose. The contact form is a drawer inside
          the signed-in sidebar, so it is unreachable by exactly the person on
          this page — offering it would repeat the same lie in a new place.
        */}
        <Link
          href="/auth/signin"
          className="block w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground text-center hover:opacity-90"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
