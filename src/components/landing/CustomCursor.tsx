'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion, useAnimationFrame } from 'framer-motion';
import { useIsMobile } from '@/hooks/useIsMobile';

/* ── Cursor SVG ──────────────────────────────────────────────── */

const CursorArrow: React.FC<{ color?: string; size?: number }> = ({ color = 'currentColor', size = 20 }) => (
  <svg width={size} height={size * 1.2} viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 1L17.5 12.5L9.5 13.5L6.5 22L3 1Z" fill={color} stroke={color} strokeWidth={0.5} strokeLinejoin="round" />
  </svg>
);

/* ── Ghost cursor config ─────────────────────────────────────── */

const GHOST_CURSORS = [
  { name: 'Planning', color: 'hsl(35 90% 55%)', speedX: 0.15, speedY: 0.12, offset: 0 },
  { name: 'Focusing', color: 'hsl(175 50% 45%)', speedX: 0.11, speedY: 0.14, offset: 2.1 },
  { name: 'Reviewing', color: 'hsl(350 60% 55%)', speedX: 0.13, speedY: 0.1, offset: 4.2 },
] as const;

/* ── Main component ──────────────────────────────────────────── */

export function CustomCursor() {
  const isMobile = useIsMobile();
  const prefersReduced = useReducedMotion();
  const [isVisible, setIsVisible] = useState(false);
  const [hasHover, setHasHover] = useState(false);
  const timeRef = useRef(0);

  // Check for hover capability
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setHasHover(mq.matches);
    const handler = (e: MediaQueryListEvent) => setHasHover(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Mouse position tracking
  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);

  // Spring config — snappy but organic
  const springConfig = prefersReduced
    ? { stiffness: 1000, damping: 100, mass: 0.1 }
    : { stiffness: 300, damping: 30, mass: 0.5 };
  const cursorX = useSpring(mouseX, springConfig);
  const cursorY = useSpring(mouseY, springConfig);

  // Ghost cursor positions
  const ghostPositions = useRef(
    GHOST_CURSORS.map(() => ({ x: 0, y: 0 }))
  );
  const [ghostCoords, setGhostCoords] = useState(
    GHOST_CURSORS.map(() => ({ x: 0, y: 0 }))
  );

  const onMouseMove = useCallback((e: MouseEvent) => {
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
    setIsVisible(true);
  }, [mouseX, mouseY]);

  const onMouseLeave = useCallback(() => {
    setIsVisible(false);
  }, []);

  const onMouseEnter = useCallback(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    if (!hasHover || isMobile) return;
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('mouseenter', onMouseEnter);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('mouseenter', onMouseEnter);
    };
  }, [hasHover, isMobile, onMouseMove, onMouseLeave, onMouseEnter]);

  // Ghost cursor animation loop
  useAnimationFrame((_, delta) => {
    if (prefersReduced || !hasHover || isMobile) return;
    timeRef.current += delta / 1000;
    const t = timeRef.current;
    const cx = typeof window !== 'undefined' ? window.innerWidth / 2 : 700;
    const cy = typeof window !== 'undefined' ? window.innerHeight / 2 : 400;
    const rx = Math.min(cx * 0.6, 350);
    const ry = Math.min(cy * 0.5, 220);

    let changed = false;
    const newPositions = GHOST_CURSORS.map((ghost, i) => {
      const x = cx + rx * Math.sin(t * ghost.speedX + ghost.offset);
      const y = cy + ry * Math.cos(t * ghost.speedY + ghost.offset * 1.3);
      const prev = ghostPositions.current[i];
      if (Math.abs(prev.x - x) > 0.5 || Math.abs(prev.y - y) > 0.5) {
        changed = true;
      }
      return { x, y };
    });

    if (changed) {
      ghostPositions.current = newPositions;
      setGhostCoords([...newPositions]);
    }
  });

  // Don't render on mobile or non-hover devices
  if (isMobile || !hasHover) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]" aria-hidden="true">
      {/* User cursor */}
      <motion.div
        className="absolute top-0 left-0 pointer-events-none"
        style={{ x: cursorX, y: cursorY, willChange: 'transform' }}
        animate={{ opacity: isVisible ? 1 : 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="relative -ml-[2px] -mt-[2px]" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}>
          <CursorArrow color="hsl(var(--primary))" />
          <div className="absolute top-5 left-3 bg-primary text-primary-foreground text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap shadow-sm">
            You
          </div>
        </div>
      </motion.div>

      {/* Ghost cursors */}
      {!prefersReduced && ghostCoords.map((pos, i) => {
        const ghost = GHOST_CURSORS[i];
        return (
          <div
            key={ghost.name}
            className="absolute top-0 left-0 pointer-events-none transition-opacity duration-1000"
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px)`,
              opacity: 0.45,
              willChange: 'transform',
            }}
          >
            <div className="relative -ml-[2px] -mt-[2px]" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>
              <CursorArrow color={ghost.color} />
              <div
                className="absolute top-5 left-3 text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap shadow-sm"
                style={{ backgroundColor: ghost.color, color: '#fff' }}
              >
                {ghost.name}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
