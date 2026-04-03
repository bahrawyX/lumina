'use client';

import React, { useRef, useEffect, useMemo } from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';
import { useTheme } from 'next-themes';

interface LottieIconProps {
  src: Record<string, unknown>;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
  /** When true, replay animation (used for hover triggers) */
  replay?: boolean;
}

/**
 * Recursively replace a specific color [r,g,b,a] in lottie JSON
 * with a new color. Targets the "k" array inside "c" (color) objects.
 */
function replaceColor(
  obj: unknown,
  from: [number, number, number],
  to: [number, number, number],
): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => replaceColor(item, from, to));
  }
  if (obj && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      if (
        key === 'k' &&
        Array.isArray(record[key]) &&
        (record[key] as number[]).length === 4
      ) {
        const k = record[key] as number[];
        if (
          Math.abs(k[0] - from[0]) < 0.05 &&
          Math.abs(k[1] - from[1]) < 0.05 &&
          Math.abs(k[2] - from[2]) < 0.05
        ) {
          result[key] = [to[0], to[1], to[2], k[3]];
          continue;
        }
      }
      result[key] = replaceColor(record[key], from, to);
    }
    return result;
  }
  return obj;
}

/** Parse HSL CSS variable value "H S% L%" → [r, g, b] in 0–1 range */
function hslToRgb01(hslStr: string): [number, number, number] {
  const parts = hslStr.trim().split(/\s+/);
  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;

  if (s === 0) return [l, l, l];

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
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
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (replay && lottieRef.current) {
      lottieRef.current.goToAndPlay(0);
    }
  }, [replay]);

  // Replace the hardcoded dark gray [0.2, 0.2, 0.2] with the current
  // foreground color so icons adapt to light/dark mode.
  const themedSrc = useMemo(() => {
    if (typeof window === 'undefined') return src;

    const style = getComputedStyle(document.documentElement);
    const fgHsl = style.getPropertyValue('--foreground').trim();
    if (!fgHsl) return src;

    const fgRgb = hslToRgb01(fgHsl);
    return replaceColor(src, [0.2, 0.2, 0.2], fgRgb) as Record<string, unknown>;
  }, [src, resolvedTheme]);

  return (
    <Lottie
      lottieRef={lottieRef}
      animationData={themedSrc}
      loop={loop}
      autoplay={autoplay}
      style={{ width: size, height: size, flexShrink: 0 }}
      className={className}
    />
  );
};

export default LottieIcon;
