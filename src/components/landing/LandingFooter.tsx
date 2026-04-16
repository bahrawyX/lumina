'use client';

import { LottieAnimation } from './LottieAnimation';
import { LOTTIES } from '@/lib/landing/lottieConfig';
import { useLottieHover } from '@/hooks/useLottieControls';

export function LandingFooter() {
  const wave = useLottieHover(0.5, 1.8);

  return (
    <footer className="border-t border-border/40 py-8 px-4 md:px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-logo text-[16px] font-medium tracking-[-0.035em] text-foreground/80">
            Lumina
          </span>
          <span className="text-muted-foreground/40">·</span>
          <div
            className="flex items-center gap-1.5"
            onMouseEnter={wave.onMouseEnter}
            onMouseLeave={wave.onMouseLeave}
          >
            <span className="font-mono text-[10px] text-muted-foreground/50 tracking-wide">
              Built by Abdelrahman El-Bahrawy
            </span>
            {/* Waving hand Lottie — slow gentle loop, speeds up on hover */}
            <div className="w-8 h-8 flex-shrink-0" aria-hidden="true">
              <LottieAnimation
                src={LOTTIES.wave.src}
                autoplay
                loop
                speed={0.5}
                className="w-full h-full"
                dotLottieRefCallback={wave.setRef}
              />
            </div>
          </div>
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
