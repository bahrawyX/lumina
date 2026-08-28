'use client';

import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';
import { useState, type CSSProperties } from 'react';

// DotLottieReact needs browser APIs (WebAssembly + Canvas) — must be client-only
const DotLottieReact = dynamic(
  () => import('@lottiefiles/dotlottie-react').then((mod) => mod.DotLottieReact),
  { ssr: false }
);

/**
 * Minimal surface area of the dotLottie instance that our hooks touch.
 * The real type is large and framework-churn prone — narrow to what we use.
 */
export interface DotLottieInstance {
  play: () => void;
  pause: () => void;
  stop: () => void;
  setSpeed: (speed: number) => void;
  setFrame: (frame: number) => void;
  totalFrames: number;
}

interface LottieAnimationProps {
  src: string;
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
  className?: string;
  style?: CSSProperties;
  /**
   * Callback that receives the dotLottie instance once mounted. Use with the
   * hooks in `useLottieControls.ts` to trigger play/pause/speed changes.
   */
  dotLottieRefCallback?: (dotLottie: DotLottieInstance | null) => void;
  /** If true, the first frame is rendered static (for reduced-motion / previews) */
  staticFirstFrame?: boolean;
}

export function LottieAnimation({
  src,
  loop = true,
  autoplay = true,
  speed = 1,
  className,
  style,
  dotLottieRefCallback,
  staticFirstFrame = false,
}: LottieAnimationProps) {
  const prefersReduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const effectiveAutoplay = prefersReduced || staticFirstFrame ? false : autoplay;
  const effectiveLoop = prefersReduced ? false : loop;

  // When reduced motion is enabled, snap to frame 0 so the Lottie renders as
  // a static poster frame rather than playing. We apply it via the ref
  // callback so the consumer's hook still gets the instance for hover checks
  // (hover interactions will simply be no-ops with reduced motion).
  const handleRef = (dotLottie: DotLottieInstance | null) => {
    if (dotLottie && (prefersReduced || staticFirstFrame)) {
      dotLottie.setFrame(0);
    }
    dotLottieRefCallback?.(dotLottie);
  };

  /**
   * F1.6: there was no `onError` and no poster anywhere in this component. The
   * animations load from THREE external hosts — `lottie.host`,
   * `assets-v2.lottiefiles.com`, and jsdelivr/unpkg for the WASM renderer — so
   * a CDN 404 or a hang left the hero's 350x350 box and the four focus icons
   * as permanent empty holes, with nothing to tell the visitor anything was
   * meant to be there.
   *
   * The fallback is a neutral placeholder rather than a broken-image or error
   * message: on a marketing page an animation that fails should read as a
   * quiet gap, not as a fault.
   */
  if (failed) {
    return (
      <div
        className={className}
        style={style}
        aria-hidden="true"
        data-lottie-fallback="true"
      >
        <div className="h-full w-full rounded-2xl bg-muted/30" />
      </div>
    );
  }

  return (
    <DotLottieReact
      src={src}
      loop={effectiveLoop}
      autoplay={effectiveAutoplay}
      speed={speed}
      className={className}
      style={style}
      dotLottieRefCallback={handleRef}
      onError={() => setFailed(true)}
    />
  );
}