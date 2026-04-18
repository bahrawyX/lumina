/**
 * Mockup design tokens.
 *
 * Hard-coded dark HSL values — intentional. These render the "product
 * preview" mockups inside the landing feature showcase. They must look
 * identical regardless of the visitor's system theme or the semantic
 * token state, so we do NOT route them through `hsl(var(--*))`.
 *
 * Safe from `no-hardcoded-colors.test.ts`: that guard only matches
 * Tailwind class patterns (`text-gray-*`, `bg-gray-*`, `bg-white`).
 * Inline `style={{ background: 'hsl(...)' }}` is explicitly allowed.
 */
export const DARK = {
  bg: 'hsl(240 10% 7%)',
  surface: 'hsl(240 8% 10%)',
  surfaceElevated: 'hsl(240 7% 13%)',
  border: 'hsl(240 5% 20%)',
  borderSubtle: 'hsl(240 5% 16%)',
  text: 'hsl(36 20% 96%)',
  textMuted: 'hsl(36 8% 62%)',
  textSubtle: 'hsl(240 5% 42%)',
} as const;

export const ACCENT = {
  violet: 'hsl(249 66% 64%)',
  violetSoft: 'hsl(249 66% 64% / 0.18)',
  emerald: 'hsl(158 55% 52%)',
  emeraldSoft: 'hsl(158 55% 52% / 0.18)',
  amber: 'hsl(38 92% 60%)',
  amberSoft: 'hsl(38 92% 60% / 0.18)',
  rose: 'hsl(346 75% 62%)',
  roseSoft: 'hsl(346 75% 62% / 0.18)',
  sky: 'hsl(204 80% 60%)',
  skySoft: 'hsl(204 80% 60% / 0.18)',
  lime: 'hsl(75 80% 58%)',
  limeSoft: 'hsl(75 80% 58% / 0.18)',
} as const;
