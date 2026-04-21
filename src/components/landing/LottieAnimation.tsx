'use client';

import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';

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

  return (
    <DotLottieReact
      src={src}
      loop={effectiveLoop}
      autoplay={effectiveAutoplay}
      speed={speed}
      className={className}
      style={style}
      dotLottieRefCallback={handleRef}
    />
  );
}