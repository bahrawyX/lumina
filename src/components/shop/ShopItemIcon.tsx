import React from 'react';
import { ACCENT_COLORS } from '@/config/shopItems';

/**
 * Hand-tuned SVG icons for every SKU in the shop.
 *
 * Why SVG instead of emoji:
 *   - Emoji glyphs render differently on macOS / Windows / Android /
 *     Linux and break the Focused Craft aesthetic.
 *   - Outline icons on 1.5px strokes match the rest of the app's
 *     iconography (CoinIcon, PlusIcon, MoreIcon in GoalsPage).
 *   - Accent cosmetics get a filled swatch pulled from ACCENT_COLORS
 *     so the icon *is* the color you're buying.
 */

export interface ShopItemIconProps {
  id: string;
  size?: number;
  className?: string;
}

const SvgBase: React.FC<
  React.PropsWithChildren<{ size: number; className?: string; strokeWidth?: number }>
> = ({ size, className, strokeWidth = 1.5, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

// ── Power-Ups ──────────────────────────────────────────────────────────────

const FocusBoostIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Lightning bolt */}
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
  </SvgBase>
);

const TaskMultiplierIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Four-point sparkle (×2 feel) */}
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
    <path d="M6.3 6.3l3 3M14.7 14.7l3 3M17.7 6.3l-3 3M9.3 14.7l-3 3" />
  </SvgBase>
);

const StreakShieldIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Shield with inner flame */}
    <path d="M12 2 4 5v7c0 4.5 3.5 8.5 8 10 4.5-1.5 8-5.5 8-10V5l-8-3z" />
    <path d="M12 8c-1 1.5-2 2.5-2 4a2 2 0 0 0 4 0c0-.8-.4-1.4-1-2 0-.8-.4-1.4-1-2z" />
  </SvgBase>
);

const GoalAcceleratorIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Rocket */}
    <path d="M14 3c3 0 7 4 7 7-2 0-4 1-5 2l-4 4-4-4 4-4c1-1 2-3 2-5z" />
    <circle cx="15.5" cy="8.5" r="1" />
    <path d="M9 15l-3 3M5 13l-2 2 3 1 1 3 2-2" />
  </SvgBase>
);

const AutoPlanIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Calendar with AI spark */}
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
    <path d="M12 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" strokeWidth="1.2" />
  </SvgBase>
);

// ── Cosmetics ──────────────────────────────────────────────────────────────

const AccentSwatch: React.FC<{
  size: number;
  className?: string;
  accentKey: string;
}> = ({ size, className, accentKey }) => {
  const hsl = ACCENT_COLORS[accentKey];
  const fill = hsl ? `hsl(${hsl})` : 'currentColor';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Outer ring in currentColor for contrast */}
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeOpacity="0.35"
        fill="none"
      />
      {/* Filled swatch */}
      <circle cx="12" cy="12" r="6.5" fill={fill} />
      {/* Gloss highlight */}
      <path
        d="M8.5 9.5a4.5 4.5 0 0 1 5-2"
        stroke="white"
        strokeOpacity="0.5"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
};

const ConfettiIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Party popper */}
    <path d="M4 20 9 9l6 6-11 5z" />
    <path d="M14 4l1 2M18 3l.5 2M20 7l2 .5M17 11l2.5.5" />
    <path d="M15 9c1-3 3-4 6-4" />
  </SvgBase>
);

const DeepWorkerIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Head with headphones */}
    <circle cx="12" cy="11" r="5" />
    <path d="M4 14v-3a8 8 0 0 1 16 0v3" />
    <rect x="3" y="13" width="3" height="5" rx="1" fill="currentColor" fillOpacity="0.15" />
    <rect x="18" y="13" width="3" height="5" rx="1" fill="currentColor" fillOpacity="0.15" />
  </SvgBase>
);

const StreakMasterIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Flame */}
    <path d="M12 2c2 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4-.5 2 .5 3 1 3 0-3 1-6 2-9z" />
  </SvgBase>
);

const GoalCrusherIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Trophy */}
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
    <path d="M16 6h3v2a3 3 0 0 1-3 3M8 6H5v2a3 3 0 0 0 3 3" />
    <path d="M10 13h4v3h-4z" />
    <path d="M7 20h10" />
    <path d="M9 20l1-4M15 20l-1-4" />
  </SvgBase>
);

// ── Unlocks ────────────────────────────────────────────────────────────────

const ExtendedHistoryIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Bar chart */}
    <path d="M3 21h18" />
    <rect x="5" y="13" width="3" height="6" rx="0.5" />
    <rect x="10.5" y="9" width="3" height="10" rx="0.5" />
    <rect x="16" y="5" width="3" height="14" rx="0.5" />
  </SvgBase>
);

const CustomCategoriesIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Tag with dot */}
    <path d="M3 12l9-9h8v8l-9 9-8-8z" />
    <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" />
  </SvgBase>
);

const ExtraTemplatesIcon: React.FC<{ size: number; className?: string }> = (p) => (
  <SvgBase {...p}>
    {/* Stacked documents */}
    <rect x="7" y="3" width="12" height="15" rx="2" />
    <path d="M5 6v13a2 2 0 0 0 2 2h10" strokeOpacity="0.55" />
    <path d="M10 8h6M10 11h6M10 14h4" strokeWidth="1.2" />
  </SvgBase>
);

// ── Registry ──────────────────────────────────────────────────────────────

const ICON_REGISTRY: Record<string, React.FC<{ size: number; className?: string }>> = {
  focus_boost: FocusBoostIcon,
  task_multiplier: TaskMultiplierIcon,
  streak_shield: StreakShieldIcon,
  goal_accelerator: GoalAcceleratorIcon,
  auto_plan: AutoPlanIcon,
  confetti_unlock: ConfettiIcon,
  badge_deep_worker: DeepWorkerIcon,
  badge_streak_master: StreakMasterIcon,
  badge_goal_crusher: GoalCrusherIcon,
  extended_history: ExtendedHistoryIcon,
  custom_categories: CustomCategoriesIcon,
  extra_templates: ExtraTemplatesIcon,
};

export const ShopItemIcon: React.FC<ShopItemIconProps> = ({ id, size = 24, className }) => {
  // Accent swatches are driven by ACCENT_COLORS; color IS the icon
  if (id.startsWith('accent_')) {
    return <AccentSwatch size={size} className={className} accentKey={id.replace('accent_', '')} />;
  }

  const Icon = ICON_REGISTRY[id];
  if (!Icon) {
    // Fallback — blank circle (should never fire in practice)
    return (
      <SvgBase size={size} className={className}>
        <circle cx="12" cy="12" r="9" />
      </SvgBase>
    );
  }
  return <Icon size={size} className={className} />;
};

/** Map of all SKU ids we ship icons for (excluding accent_* which are dynamic). */
export const SHOP_ICON_IDS = Object.keys(ICON_REGISTRY);
