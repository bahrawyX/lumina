'use client';

import type { CSSProperties, ReactNode } from 'react';

/**
 * Wraps a region of the landing page to declare a custom-cursor label and
 * color for when the mouse is hovering inside it.
 *
 * The `CustomCursor` component reads `data-cursor-label` and
 * `data-cursor-color` attributes from the element under the mouse — whoever
 * is topmost wins. Outside any zone, the native cursor is restored.
 *
 * Usage:
 *   <CursorZone label="Focus" color="#cef136">
 *     ...section content...
 *   </CursorZone>
 */
export function CursorZone({
  label,
  color,
  children,
  as: Tag = 'div',
  className,
  style,
  ...rest
}: {
  label: string;
  /** CSS color for the label pill background */
  color: string;
  children: ReactNode;
  as?: 'div' | 'section';
  className?: string;
  style?: CSSProperties;
} & React.HTMLAttributes<HTMLElement>) {
  const Component = Tag as React.ElementType;
  return (
    <Component
      data-cursor-label={label}
      data-cursor-color={color}
      className={className}
      style={style}
      {...rest}
    >
      {children}
    </Component>
  );
}
