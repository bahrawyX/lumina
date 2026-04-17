'use client';

export function LandingFooter() {
  return (
    <footer className="border-t border-border/40 py-8 px-4 md:px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-logo text-[16px] font-medium tracking-[-0.035em] text-foreground/80">
            Lumina
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="font-mono text-[10px] text-muted-foreground/50 tracking-wide">
            Built by Abdelrahman El-Bahrawy
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/bahrawyX/lumina"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors tracking-wide"
          >
            GitHub
          </a>
          <span className="font-mono text-[10px] text-muted-foreground/40 tracking-wide">
            © {new Date().getFullYear()}
          </span>
        </div>
      </div>
    </footer>
  );
}
