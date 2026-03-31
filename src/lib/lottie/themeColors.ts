/**
 * Reads Lumina's CSS variable system and returns resolved color values
 * suitable for Lottie colorFilter injection.
 *
 * Lottie colorFilters expect values in the range [0, 1] per channel (r, g, b, a).
 * CSS HSL variables from Tailwind look like: "262 83% 58%" (no hsl() wrapper).
 * This utility converts them to the [0,1] float format Lottie needs.
 */

export type RGBA = [number, number, number, number]

export interface LottieColorPalette {
  primary: RGBA
  primaryMuted: RGBA
  foreground: RGBA
  mutedForeground: RGBA
  background: RGBA
  card: RGBA
  border: RGBA
  success: RGBA
  warning: RGBA
  destructive: RGBA
}

function hslStringToRgb01(hslString: string): [number, number, number] {
  const parts = hslString.trim().split(/\s+/)
  const h = parseFloat(parts[0])
  const s = parseFloat(parts[1]) / 100
  const l = parseFloat(parts[2]) / 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r = 0,
    g = 0,
    b = 0
  if (h < 60) {
    r = c; g = x; b = 0
  } else if (h < 120) {
    r = x; g = c; b = 0
  } else if (h < 180) {
    r = 0; g = c; b = x
  } else if (h < 240) {
    r = 0; g = x; b = c
  } else if (h < 300) {
    r = x; g = 0; b = c
  } else {
    r = c; g = 0; b = x
  }

  return [r + m, g + m, b + m]
}

function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function getLottieColorPalette(): LottieColorPalette {
  const primary = hslStringToRgb01(getCSSVar('--primary'))
  const foreground = hslStringToRgb01(getCSSVar('--foreground'))
  const mutedFg = hslStringToRgb01(getCSSVar('--muted-foreground'))
  const background = hslStringToRgb01(getCSSVar('--background'))
  const card = hslStringToRgb01(getCSSVar('--card'))
  const border = hslStringToRgb01(getCSSVar('--border'))
  const destructiveRgb = hslStringToRgb01(getCSSVar('--destructive'))

  // Semantic colors — fallback to hardcoded values if CSS vars don't exist
  const successRaw = getCSSVar('--success') || null
  const success: [number, number, number] = successRaw
    ? hslStringToRgb01(successRaw)
    : [0.216, 0.745, 0.482]

  const warningRaw = getCSSVar('--warning') || null
  const warning: [number, number, number] = warningRaw
    ? hslStringToRgb01(warningRaw)
    : [0.969, 0.706, 0.208]

  return {
    primary: [...primary, 1],
    primaryMuted: [...primary, 0.3],
    foreground: [...foreground, 1],
    mutedForeground: [...mutedFg, 1],
    background: [...background, 1],
    card: [...card, 1],
    border: [...border, 1],
    success: [...success, 1],
    warning: [...warning, 1],
    destructive: [...destructiveRgb, 1],
  }
}
