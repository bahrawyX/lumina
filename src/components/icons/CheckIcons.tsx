import React from 'react';

/**
 * The check glyphs, defined once.
 *
 * P3-9(f): there were ten `CheckIcon` declarations in `src/`. Nine were
 * hand-inlined at their point of use and one — `UtilityIcons.CheckIcon` — is a
 * framer-motion animated icon built on `IconBase`, a genuinely different
 * component that happens to share the name.
 *
 * The nine were not nine copies of one icon. They were **three different
 * glyphs** wearing the same name, which is why the duplication kept growing
 * rather than getting noticed:
 *
 *  - a plain checkmark, six times, at four sizes and three stroke widths;
 *  - a clipboard-with-check, twice;
 *  - a circle-with-check, once.
 *
 * Merging them all into one `CheckIcon` would have silently changed two
 * components' iconography. They are separate exports here, named for what they
 * actually draw, so the next person reaching for "the check icon" picks the
 * right one instead of inlining a tenth.
 */

export interface CheckIconProps {
  /** Square px size. The inline copies ranged 10–18. */
  size?: number;
  /** The inline copies used 2, 2.5 and 3 — thinner reads better at large sizes. */
  strokeWidth?: number;
  className?: string;
}

/** A bare checkmark. */
export const CheckIcon: React.FC<CheckIconProps> = ({
  size = 14,
  strokeWidth = 2,
  className,
}) => (
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
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/** A clipboard with a check — "task recorded", not "this is selected". */
export const ClipboardCheckIcon: React.FC<CheckIconProps> = ({
  size = 12,
  strokeWidth = 2,
  className,
}) => (
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
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

/** A check inside a circle — a completed/connected state. */
export const CheckCircleIcon: React.FC<CheckIconProps> = ({
  size = 16,
  strokeWidth = 2,
  className,
}) => (
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
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
