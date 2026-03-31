import type { AnimationItem } from 'lottie-web'
import { getLottieColorPalette, type LottieColorPalette } from './themeColors'

/**
 * Maps layer names (as defined in the animation JSON) to palette keys.
 * This is the contract between the animation designer and the code.
 */
export type LayerColorMap = Record<string, keyof LottieColorPalette>

/**
 * Applies color overrides to a Lottie animation instance.
 * Must be called AFTER lottie.loadAnimation() — attaches to the DOMLoaded event.
 */
export function applyThemeColors(
  anim: AnimationItem,
  layerColorMap: LayerColorMap
): void {
  const palette = getLottieColorPalette()
  anim.addEventListener('DOMLoaded', () => {
    traverseAndColor(anim, layerColorMap, palette)
  })
}

/**
 * Re-applies colors with fresh palette (call on theme change).
 */
export function reapplyThemeColors(
  anim: AnimationItem,
  layerColorMap: LayerColorMap
): void {
  const palette = getLottieColorPalette()
  traverseAndColor(anim, layerColorMap, palette)
}

function traverseAndColor(
  anim: AnimationItem,
  layerColorMap: LayerColorMap,
  palette: LottieColorPalette
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderer = (anim as any).renderer
  if (!renderer?.elements) return

  for (const element of renderer.elements) {
    applyToElement(element, layerColorMap, palette)
  }
}

function applyToElement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element: any,
  layerColorMap: LayerColorMap,
  palette: LottieColorPalette
): void {
  if (!element) return

  const layerName: string = element.data?.nm ?? ''
  const paletteKey = layerColorMap[layerName]

  if (paletteKey && palette[paletteKey]) {
    const [r, g, b, a] = palette[paletteKey]

    // Apply to shape elements
    if (element.shapes) {
      for (const shape of element.shapes) {
        applyColorToShapeTree(shape, r, g, b, a)
      }
    }

    // Apply to solid layers
    if (element.data?.ty === 1 && element.svgElement) {
      element.svgElement.setAttribute('fill', rgbToHex(r, g, b))
      element.svgElement.setAttribute('fill-opacity', String(a))
    }
  }

  // Recurse into nested elements
  if (element.elements) {
    for (const child of element.elements) {
      applyToElement(child, layerColorMap, palette)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyColorToShapeTree(shape: any, r: number, g: number, b: number, a: number): void {
  if (!shape) return

  // Fill or Stroke — override color
  if (shape.ty === 'fl' || shape.ty === 'st') {
    if (shape.c?.k) {
      if (Array.isArray(shape.c.k) && shape.c.k.length >= 3 && typeof shape.c.k[0] === 'number') {
        shape.c.k[0] = r
        shape.c.k[1] = g
        shape.c.k[2] = b
      }
    }
    if (shape.o?.k !== undefined && a !== 1) {
      shape.o.k = a * 100
    }
  }

  // Group — recurse into items
  if (shape.it) {
    for (const child of shape.it) {
      applyColorToShapeTree(child, r, g, b, a)
    }
  }

  // ShapeElement wrapper — recurse into shapes property
  if (shape.shapes) {
    for (const child of shape.shapes) {
      applyColorToShapeTree(child, r, g, b, a)
    }
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
