/**
 * F1.10: `'use client'` for one reason — `new Date().getFullYear()`, which is
 * also a hydration-mismatch hazard across a New Year boundary: the server
 * renders one year, a client hydrating seconds later renders another, and
 * React logs a mismatch on the busiest night of the year for nobody's benefit.
 *
 * Computed once on the server now. This is a server component.
 */
/** Evaluated at render time on the server — never re-computed on the client. */
const YEAR = new Date().getFullYear();

export function LandingFooter() {
  return (
    <footer className="border-t border-border/40 py-8 px-4 md:px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-logo text-[16px] font-medium tracking-[-0.035em] text-foreground/80">
            Lumina
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="font-mono text-[10px] text-muted-foreground-subtle tracking-wide">
            Built by Abdelrahman El-Bahrawy
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/bahrawyX/lumina"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-muted-foreground-subtle hover:text-muted-foreground transition-colors tracking-wide"
          >
            GitHub
          </a>
          <span className="font-mono text-[10px] text-muted-foreground/40 tracking-wide">
            © {YEAR}
          </span>
        </div>
      </div>
    </footer>
  );
}
