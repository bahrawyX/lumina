'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useTheme } from 'next-themes'
import type { AnimationItem } from 'lottie-web'
import { type LayerColorMap } from '@/lib/lottie/colorInjector'
import { getLottieColorPalette, type LottieColorPalette } from '@/lib/lottie/themeColors'

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

/**
 * Recolor Lottie JSON data at the source level — finds layers by `nm`,
 * then replaces all fill/stroke `c.k` color arrays in their shapes.
 */
function recolorJsonData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  layerColorMap: LayerColorMap,
  palette: LottieColorPalette,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const clone = JSON.parse(JSON.stringify(data))
  if (!clone.layers) return clone

  for (const layer of clone.layers) {
    const paletteKey = layerColorMap[layer.nm]
    if (!paletteKey || !palette[paletteKey]) continue

    const [r, g, b] = palette[paletteKey]
    if (layer.shapes) {
      recolorShapes(layer.shapes, r, g, b)
    }
  }

  return clone
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function recolorShapes(shapes: any[], r: number, g: number, b: number): void {
  for (const shape of shapes) {
    if ((shape.ty === 'fl' || shape.ty === 'st') && shape.c?.k) {
      const k = shape.c.k
      if (Array.isArray(k) && k.length >= 3 && typeof k[0] === 'number') {
        k[0] = r
        k[1] = g
        k[2] = b
      }
    }
    // Recurse into groups
    if (shape.it) recolorShapes(shape.it, r, g, b)
  }
}

// JSON fetch cache so we don't re-fetch the same animation file
const jsonCache = new Map<string, Promise<unknown>>()

function fetchJson(path: string): Promise<unknown> {
  if (!jsonCache.has(path)) {
    jsonCache.set(path, fetch(path).then((r) => r.json()))
  }
  return jsonCache.get(path)!
}

export function useLottie(options: UseLottieOptions): UseLottieReturn {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const animRef = useRef<AnimationItem | null>(null)
  const jsonRef = useRef<unknown>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const { resolvedTheme } = useTheme()

  // Check reduced motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!containerRef.current) return

    let anim: AnimationItem | null = null
    let destroyed = false

    Promise.all([
      import('lottie-web'),
      fetchJson(options.path),
    ]).then(([lottieModule, rawJson]) => {
      if (destroyed || !containerRef.current) return

      jsonRef.current = rawJson
      const palette = getLottieColorPalette()
      const coloredData = recolorJsonData(rawJson, options.layerColorMap, palette)

      const lottie = lottieModule.default
      anim = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop: prefersReducedMotion ? false : (options.loop ?? false),
        autoplay: false,
        animationData: coloredData,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: false,
          hideOnTransparent: true,
        },
      })

      animRef.current = anim

      anim.addEventListener('DOMLoaded', () => {
        if (destroyed) return
        setIsLoaded(true)

        if (options.speed && options.speed !== 1) {
          anim!.setSpeed(options.speed)
        }

        if (prefersReducedMotion) {
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

  // Re-apply colors when theme changes — destroy and re-create with fresh palette
  useEffect(() => {
    if (!animRef.current || !isLoaded || !jsonRef.current || !containerRef.current) return

    const palette = getLottieColorPalette()
    const coloredData = recolorJsonData(jsonRef.current, options.layerColorMap, palette)

    const container = containerRef.current
    const prevAnim = animRef.current
    const wasPlaying = !prevAnim.isPaused
    const currentFrame = prevAnim.currentFrame

    prevAnim.destroy()

    import('lottie-web').then((lottieModule) => {
      const lottie = lottieModule.default
      const anim = lottie.loadAnimation({
        container,
        renderer: 'svg',
        loop: prefersReducedMotion ? false : (options.loop ?? false),
        autoplay: false,
        animationData: coloredData,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: false,
          hideOnTransparent: true,
        },
      })

      animRef.current = anim

      anim.addEventListener('DOMLoaded', () => {
        if (options.speed && options.speed !== 1) {
          anim.setSpeed(options.speed)
        }
        anim.goToAndStop(currentFrame, true)
        if (wasPlaying) anim.play()
      })

      if (options.onComplete) {
        anim.addEventListener('complete', options.onComplete)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme])

  /**
   * P2-15: `autoplay` and `loop` already respected the OS setting, but the
   * IMPERATIVE handles did not — `LottieAnimation`'s `playTrigger` calls
   * `play()` directly, so a celebration or achievement animation still ran at
   * full strength for a user who had asked their system to stop animations.
   *
   * The reduced-motion path renders the first frame as a static poster, which
   * is what `DOMLoaded` already does on mount.
   */
  const play = useCallback(() => {
    if (prefersReducedMotion) {
      animRef.current?.goToAndStop(0, true)
      return
    }
    animRef.current?.play()
  }, [prefersReducedMotion])
  const pause = useCallback(() => animRef.current?.pause(), [])
  const stop = useCallback(() => animRef.current?.stop(), [])
  const setSpeed = useCallback((s: number) => animRef.current?.setSpeed(s), [])
  const goToAndPlay = useCallback(
    (frame: number) => {
      if (prefersReducedMotion) {
        animRef.current?.goToAndStop(frame, true)
        return
      }
      animRef.current?.goToAndPlay(frame, true)
    },
    [prefersReducedMotion],
  )

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
