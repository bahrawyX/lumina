'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useTheme } from 'next-themes'
import type { AnimationItem } from 'lottie-web'
import { applyThemeColors, reapplyThemeColors, type LayerColorMap } from '@/lib/lottie/colorInjector'

interface UseLottieOptions {
  path: string
  layerColorMap: LayerColorMap
  loop?: boolean
  autoplay?: boolean
  segments?: [number, number]
  onComplete?: () => void
  speed?: number
}

interface UseLottieReturn {
  containerRef: React.RefObject<HTMLDivElement | null>
  play: () => void
  pause: () => void
  stop: () => void
  setSpeed: (speed: number) => void
  goToAndPlay: (frame: number) => void
  isLoaded: boolean
}

export function useLottie(options: UseLottieOptions): UseLottieReturn {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const animRef = useRef<AnimationItem | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const { resolvedTheme } = useTheme()

  // Check reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!containerRef.current) return

    let anim: AnimationItem | null = null
    let destroyed = false

    import('lottie-web').then((lottieModule) => {
      if (destroyed || !containerRef.current) return

      const lottie = lottieModule.default
      anim = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop: prefersReducedMotion ? false : (options.loop ?? false),
        autoplay: false,
        path: options.path,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: false,
          hideOnTransparent: true,
        },
      })

      animRef.current = anim

      applyThemeColors(anim, options.layerColorMap)

      anim.addEventListener('DOMLoaded', () => {
        if (destroyed) return
        setIsLoaded(true)

        if (options.speed && options.speed !== 1) {
          anim!.setSpeed(options.speed)
        }

        if (prefersReducedMotion) {
          // Show static first frame only
          anim!.goToAndStop(0, true)
          return
        }

        if (options.autoplay !== false) {
          if (options.segments) {
            anim!.playSegments(options.segments, true)
          } else {
            anim!.play()
          }
        }
      })

      if (options.onComplete) {
        anim.addEventListener('complete', options.onComplete)
      }
    })

    return () => {
      destroyed = true
      if (anim) {
        anim.destroy()
        animRef.current = null
        setIsLoaded(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.path])

  // Re-apply colors when theme changes
  useEffect(() => {
    if (!animRef.current || !isLoaded) return
    reapplyThemeColors(animRef.current, options.layerColorMap)
  }, [resolvedTheme, options.layerColorMap, isLoaded])

  const play = useCallback(() => animRef.current?.play(), [])
  const pause = useCallback(() => animRef.current?.pause(), [])
  const stop = useCallback(() => animRef.current?.stop(), [])
  const setSpeed = useCallback((s: number) => animRef.current?.setSpeed(s), [])
  const goToAndPlay = useCallback((frame: number) => animRef.current?.goToAndPlay(frame, true), [])

  return {
    containerRef,
    play,
    pause,
    stop,
    setSpeed,
    goToAndPlay,
    isLoaded,
  }
}
