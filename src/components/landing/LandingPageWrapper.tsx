'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLuminaAuthClient } from '@/components/AuthProvider';
import { LandingPage } from './LandingPage';

export function LandingPageWrapper() {
  const router = useRouter();
  const authClient = useLuminaAuthClient();
  const { data: session, isPending } = authClient.useSession();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (session?.user) {
      router.replace('/calendar');
    } else {
      setReady(true);
    }
  }, [isPending, session, router]);

  // Show a minimal loading state while checking auth
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="font-logo text-2xl font-medium tracking-[-0.035em] text-foreground/20 animate-pulse">
          Lumina
        </span>
      </div>
    );
  }

  return <LandingPage />;
}
