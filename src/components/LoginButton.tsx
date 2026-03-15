'use client';

import React, { useState } from 'react';
import { useLuminaAuthClient } from './AuthProvider';
import { useUser } from '@/hooks/useUser';

export default function LoginButton() {
  const authClient = useLuminaAuthClient();
  const { user, isLoading, isAuthenticated, refetch } = useUser();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignIn = async () => {
    const email = window.prompt('Email address');
    const password = window.prompt('Password (8+ chars)');

    if (!email || !password) return;

    setBusy(true);
    setErrorMessage(null);

    try {
      const signIn = await authClient.signIn.email({
        email,
        password,
        callbackURL: '/',
      });

      if (signIn.error) {
        const shouldCreate = window.confirm('User not found or invalid password. Create this account now?');
        if (!shouldCreate) {
          setErrorMessage(signIn.error.message ?? 'Unable to sign in.');
          return;
        }

        const defaultName = email.split('@')[0] || 'Lumina User';
        const signup = await authClient.signUp.email({
          email,
          password,
          name: defaultName,
          callbackURL: '/',
        });

        if (signup.error) {
          setErrorMessage(signup.error.message ?? 'Unable to create account.');
          return;
        }
      }

      await refetch();
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setErrorMessage(null);

    try {
      const result = await authClient.signOut();
      if (result.error) {
        setErrorMessage(result.error.message ?? 'Unable to sign out.');
        return;
      }
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-background/90 px-3 py-2 text-xs shadow-sm">
      <div className="mb-2 text-muted-foreground">
        {isAuthenticated ? `Signed in as ${user?.email ?? 'user'}` : 'Not signed in'}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={isAuthenticated ? handleSignOut : handleSignIn}
          disabled={busy || isLoading}
          className="rounded border border-border px-2 py-1 text-foreground hover:bg-muted disabled:opacity-50"
        >
          {isAuthenticated ? 'Sign Out' : 'Sign In'}
        </button>
      </div>
      {errorMessage && (
        <p className="mt-2 text-[11px] text-red-500">{errorMessage}</p>
      )}
    </div>
  );
}
