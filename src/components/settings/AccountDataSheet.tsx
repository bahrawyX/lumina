'use client';

import React, { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import notify from '@/utils/notify';
import { clearLuminaStorage } from '@/lib/storage';

/**
 * P2-14 — account deletion and data export.
 *
 * The endpoints (`GET /api/users/me/export`, `DELETE /api/users/me`) are what
 * the audit asked for, but a right the user cannot reach is not a right they
 * have. This is the surface that reaches them, kept deliberately small: two
 * actions, one of which is irreversible and says so.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AccountDataSheet({ open, onOpenChange }: Props) {
  /**
   * Whether this account signs in with a password decides what the delete
   * flow asks for: the password itself, or a recently-created session.
   *
   * Resolved here rather than threaded through the sidebar, and defaulted to
   * TRUE — asking for a password that turns out not to be needed is a
   * recoverable annoyance; skipping the prompt for an account that does have
   * one produces a confusing rejection from the server.
   */
  const [hasPassword, setHasPassword] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch('/api/users/preferences')
      .then((res) => (res.ok ? res.json() : null))
      .then((prefs: { hasPassword?: boolean } | null) => {
        if (!cancelled && typeof prefs?.hasPassword === 'boolean') {
          setHasPassword(prefs.hasPassword);
        }
      })
      .catch(() => {
        /* Keep the safe default. */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch('/api/users/me/export');
      if (!res.ok) {
        notify(
          res.status === 429
            ? 'You can export your data a few times an hour. Try again later.'
            : "We couldn't build your export. Please try again.",
        );
        return;
      }
      // The response is already `Content-Disposition: attachment`, but fetching
      // it as a blob keeps the download inside the app's session instead of
      // opening a new top-level navigation to a sensitive URL.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lumina-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify('Your data has been downloaded.');
    } catch {
      notify("We couldn't reach the server. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: 'DELETE',
          ...(hasPassword && password ? { password } : {}),
        }),
      });

      if (!res.ok) {
        setError(
          hasPassword
            ? 'That password was not accepted. Your account has not been changed.'
            : 'For your security, sign out and sign back in, then try again. Your account has not been changed.',
        );
        return;
      }

      // The server has already dropped every session row and cleared the
      // cookie. Local caches would otherwise outlive the account on this
      // device — and the next person to use it.
      // `seal: true` because the hard navigation on the next line ends this
      // document. This is the case where the race matters MOST: the account is
      // already gone server-side, so a store flushing before the navigation
      // commits would write a deleted account's data back to localStorage — on
      // what may well be a shared device.
      clearLuminaStorage({ seal: true });
      window.location.href = '/';
    } catch {
      setError("We couldn't reach the server. Your account has not been changed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Your data</SheetTitle>
          <SheetDescription>
            Download everything in your account, or delete it permanently.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6 px-4 pb-8">
          <section className="rounded-xl border border-border/50 bg-background p-4">
            <h3 className="text-sm font-medium text-foreground">Export</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              A JSON file containing your profile, tasks, events, documents, goals,
              focus sessions, coin history and mood logs. Passwords, sign-in tokens
              and calendar access tokens are not included — they secure the account
              rather than describe you.
            </p>
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Preparing…' : 'Download my data'}
            </Button>
          </section>

          <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <h3 className="text-sm font-medium text-foreground">Delete account</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              This removes your account and everything in it — every task, event,
              document, goal and session. It cannot be undone, and there is no
              recovery window. Export first if you want a copy.
            </p>

            {!confirmingDelete ? (
              <Button
                variant="destructive"
                className="mt-3 w-full"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete my account
              </Button>
            ) : (
              <div className="mt-3 space-y-2">
                {hasPassword ? (
                  <>
                    <label
                      htmlFor="delete-account-password"
                      className="block text-[11px] font-medium text-foreground"
                    >
                      Confirm your password
                    </label>
                    <input
                      id="delete-account-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </>
                ) : (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    You sign in with Google or Microsoft, so we ask that you have
                    signed in recently instead of asking for a password.
                  </p>
                )}

                {error && (
                  <p role="alert" className="text-[11px] leading-relaxed text-destructive">
                    {error}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setPassword('');
                      setError(null);
                    }}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleDelete}
                    disabled={deleting || (hasPassword && password.length === 0)}
                  >
                    {deleting ? 'Deleting…' : 'Permanently delete'}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
