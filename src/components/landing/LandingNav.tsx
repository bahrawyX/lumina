'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-xl border-b border-border/40">
      <nav className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4 md:px-6">
        {/* Wordmark */}
        <Link href="/" className="flex flex-col leading-none gap-0.5 select-none" aria-label="Lumina home">
          <span className="font-logo text-[20px] font-medium tracking-[-0.035em] text-foreground leading-none">
            Lumina
          </span>
          <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-muted-foreground/50 leading-none">
            Focused Craft
          </span>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/auth/signin" tabIndex={-1}>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              Sign in
            </Button>
          </Link>
          <Link href="/onboarding" tabIndex={-1}>
            <Button size="sm" className="rounded-lg px-4">
              Get started
            </Button>
          </Link>
        </div>
      </nav>
    </header>
  );
}
