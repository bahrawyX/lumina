'use client';

import React from 'react';
import { motion } from 'framer-motion';

/**
 * Animated empty state illustration for the Docs home page.
 * Floating clipboard with blinking cursor — 120x120, loops infinitely.
 */
export default function DocsEmptyAnimation() {
  return (
    <motion.svg
      width={120}
      height={120}
      viewBox="0 0 120 120"
      fill="none"
      className="opacity-60"
      initial={{ y: 0 }}
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* Clipboard body */}
      <motion.rect
        x={30}
        y={24}
        width={60}
        height={76}
        rx={8}
        stroke="currentColor"
        strokeWidth={2}
        className="text-muted-foreground"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />

      {/* Clipboard clip */}
      <motion.rect
        x={46}
        y={18}
        width={28}
        height={14}
        rx={4}
        stroke="currentColor"
        strokeWidth={2}
        className="text-muted-foreground"
        fill="hsl(var(--background))"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      />

      {/* Text lines */}
      {[44, 56, 68].map((y, i) => (
        <motion.line
          key={y}
          x1={42}
          y1={y}
          x2={i === 2 ? 62 : 78}
          y2={y}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="text-muted-foreground/40"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.8 + i * 0.15, duration: 0.5 }}
        />
      ))}

      {/* Blinking cursor */}
      <motion.line
        x1={64}
        y1={64}
        x2={64}
        y2={74}
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        strokeLinecap="round"
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
      />
    </motion.svg>
  );
}
