/**
 * The reset page must not claim to have sent an email it cannot send.
 *
 * Without `RESEND_API_KEY` / `EMAIL_FROM` there is no way to deliver a reset
 * link, and the form did not say so: it accepted an address and answered "Check
 * your email", naming the address back. That wording is deliberately identical
 * whether or not the account exists, so it leaks nothing — which is right when
 * a mail actually went out, and badly wrong when none did. The only person it
 * misleads is the real user, who waits for a message that was never sent.
 *
 * The gate is the SAME server-side `isEmailConfigured()` that drives
 * `requireEmailVerification` and `sendOnSignUp`, so setting the two variables
 * restores the real form with no code change and there is no second flag to
 * forget.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ configured: false }));
vi.mock('@/lib/email/send', () => ({
  isEmailConfigured: () => h.configured,
}));

/**
 * The real form is a client component pulling in the auth client, so it is
 * stubbed — but the stub carries the parts the assertions below look for: an
 * email field, the submit button, and the "Check your email" wording.
 *
 * The first version of this mock was a bare `<div>`. That made three of the
 * five tests pass VACUOUSLY: with no textbox and no copy anywhere in the tree,
 * "shows no email field" and "never says check your email" held no matter which
 * branch rendered. Forcing the page to always render the form failed only 2 of
 * 5 — the other three were decoration. A stub has to be able to trip the
 * assertions aimed at it, or those assertions are measuring nothing.
 */
vi.mock('@/app/auth/forgot-password/ForgotPasswordForm', () => ({
  ForgotPasswordForm: () => (
    <div data-testid="reset-form">
      <input type="email" aria-label="Email" />
      <button type="submit">Send reset link</button>
      <p>Check your email</p>
      <p>we&rsquo;ve sent a link to choose a new password</p>
    </div>
  ),
}));

import ForgotPasswordPage from '@/app/auth/forgot-password/page';

beforeEach(() => {
  h.configured = false;
});

describe('when email is not configured', () => {
  it('says it cannot send, instead of pretending it did', () => {
    render(<ForgotPasswordPage />);

    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /isn.t available yet/i })).toBeInTheDocument();
    expect(screen.queryByTestId('reset-form')).not.toBeInTheDocument();
  });

  it('never shows the "check your email" wording', () => {
    // The exact phrase that was the lie.
    render(<ForgotPasswordPage />);
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/we.ve sent a link/i)).not.toBeInTheDocument();
  });

  it('offers no email field to submit', () => {
    // A form that takes an address and does nothing with it is the defect,
    // whatever the surrounding copy says.
    render(<ForgotPasswordPage />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send reset link/i })).not.toBeInTheDocument();
  });

  it('does not link to support that a signed-out user cannot reach', () => {
    // The contact form is a drawer inside the signed-in sidebar, so it is
    // unreachable by exactly the person on this page. `/contact` is not a route
    // at all — the first draft of this page linked to it.
    const { container } = render(<ForgotPasswordPage />);
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/contact');
    expect(hrefs).toContain('/auth/signin');
  });
});

describe('when email IS configured', () => {
  it('renders the real reset form', () => {
    // The other half of the gate. Without this, deleting the form entirely
    // would still pass every test above.
    h.configured = true;
    render(<ForgotPasswordPage />);

    expect(screen.getByTestId('reset-form')).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
