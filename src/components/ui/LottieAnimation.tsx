'use client'

import { useEffect } from 'react'
import { useLottie } from '@/hooks/useLottie'
import type { LayerColorMap } from '@/lib/lottie/colorInjector'
import { cn } from '@/lib/utils'

interface LottieAnimationProps {
  path: string
  layerColorMap: LayerColorMap
  loop?: boolean
  autoplay?: boolean
  speed?: number
  segments?: [number, number]
  onComplete?: () => void
  className?: string
  width?: number | string
  height?: number | string
  /** When this transitions from false to true, restart and play the animation */
  playTrigger?: boolean
}

export function LottieAnimation({
  path,
  layerColorMap,
  loop = false,
  autoplay = true,
  speed = 1,
  segments,
  onComplete,
  className,
  width,
  height,
  playTrigger,
}: LottieAnimationProps) {
  const { containerRef, play, stop } = useLottie({
    path,
    layerColorMap,
    loop,
    autoplay: playTrigger === undefined ? autoplay : false,
    speed,
    segments,
    onComplete,
  })

  useEffect(() => {
    if (playTrigger === true) {
      stop()
      play()
    }
  }, [playTrigger, play, stop])

  return (
    <div
      ref={containerRef}
      className={cn('overflow-hidden', className)}
      style={{
        width: width ?? '100%',
        height: height ?? '100%',
        minWidth: width,
        minHeight: height,
      }}
      aria-hidden="true"
      role="presentation"
    />
  )
}

// ── Pre-configured layer maps for each animation ────────────────────────────

export const ACHIEVEMENT_LAYER_MAP: LayerColorMap = {
  bg_circle: 'primaryMuted',
  ring_outer: 'primary',
  icon_stroke: 'foreground',
  burst_dot_1: 'primary',
  burst_dot_2: 'primary',
  burst_dot_3: 'primary',
  burst_dot_4: 'primary',
  burst_dot_5: 'primary',
  burst_dot_6: 'primary',
  burst_dot_7: 'primary',
  burst_dot_8: 'primary',
  glow_blur: 'primaryMuted',
}

export const POMODORO_COMPLETE_LAYER_MAP: LayerColorMap = {
  ripple_ring_1: 'primary',
  ripple_ring_2: 'primaryMuted',
  check_bg: 'card',
  check_stroke: 'primary',
}

export const EMPTY_STATE_TASKS_LAYER_MAP: LayerColorMap = {
  clipboard_body: 'card',
  clipboard_clip: 'mutedForeground',
  line_1: 'border',
  line_2: 'border',
  line_3: 'border',
  dot_blink: 'primary',
  shadow: 'foreground',
}

export const STREAK_FIRE_LAYER_MAP: LayerColorMap = {
  flame_outer: 'warning',
  flame_inner: 'warning',
  flame_core: 'primary',
  base_glow: 'warning',
}

export const ONBOARDING_COMPLETE_LAYER_MAP: LayerColorMap = {
  sparkle_1: 'primary',
  sparkle_2: 'primary',
  sparkle_3: 'primary',
  sparkle_4: 'primary',
  sparkle_5: 'primary',
  sparkle_6: 'primary',
  sparkle_7: 'primary',
  sparkle_8: 'primary',
  sparkle_glow_1: 'primaryMuted',
  sparkle_glow_2: 'primaryMuted',
  sparkle_glow_3: 'primaryMuted',
  sparkle_glow_4: 'primaryMuted',
  sparkle_glow_5: 'primaryMuted',
  sparkle_glow_6: 'primaryMuted',
  sparkle_glow_7: 'primaryMuted',
  sparkle_glow_8: 'primaryMuted',
}

export const LOADING_PULSE_LAYER_MAP: LayerColorMap = {
  dot_1: 'primary',
  dot_2: 'primary',
  dot_3: 'primary',
}
