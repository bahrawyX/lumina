'use client';

import React, { useRef, useEffect } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';

interface LottieIconProps {
  src: Record<string, unknown>;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
  /** When true, replay animation (used for hover triggers) */
  replay?: boolean;
}

export const LottieIcon: React.FC<LottieIconProps> = ({
  src,
  size = 20,
  loop = false,
  autoplay = true,
  className,
  replay,
}) => {
  const lottieRef = useRef<LottieRefCurrentProps>(null);

  useEffect(() => {
    if (replay && lottieRef.current) {
      lottieRef.current.goToAndPlay(0);
    }
  }, [replay]);

  return (
    <Lottie
      lottieRef={lottieRef}
      animationData={src}
      loop={loop}
      autoplay={autoplay}
      style={{ width: size, height: size, flexShrink: 0 }}
      className={className}
    />
  );
};

export default LottieIcon;
