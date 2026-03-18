'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function OAuthPopupCompletePage() {
  const searchParams = useSearchParams();
  const provider = searchParams.get('provider') ?? 'oauth';

  useEffect(() => {
    if (!window.opener) return;

    try {
      window.opener.postMessage(
        {
          type: 'lumina:oauth-complete',
          provider,
        },
        window.location.origin
      );
    } finally {
      window.close();
    }
  }, [provider]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
      <div className="max-w-sm text-center space-y-2">
        <h1 className="text-lg font-semibold">Authentication complete</h1>
        <p className="text-sm text-muted-foreground">You can close this window and continue onboarding.</p>
      </div>
    </main>
  );
}
