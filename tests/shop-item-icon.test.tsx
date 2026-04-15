/**
 * ShopItemIcon — verifies every SKU from shopItems.ts gets a custom SVG,
 * accent swatches pull the right HSL, and the component ships crisp
 * currentColor-based strokes that can be recolored by parent tinting.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ShopItemIcon, SHOP_ICON_IDS } from '@/components/shop/ShopItemIcon';
import { SHOP_ITEMS, ACCENT_COLORS } from '@/config/shopItems';

const isAccent = (id: string) => id.startsWith('accent_');

describe('ShopItemIcon', () => {
  it('renders an SVG root for every non-accent SKU', () => {
    const nonAccent = SHOP_ITEMS.filter(i => !isAccent(i.id));
    for (const item of nonAccent) {
      const { container, unmount } = render(<ShopItemIcon id={item.id} />);
      const svg = container.querySelector('svg');
      expect(svg, `missing svg for ${item.id}`).toBeTruthy();
      unmount();
    }
  });

  it('ICON_REGISTRY covers every non-accent SKU', () => {
    const nonAccentIds = SHOP_ITEMS.filter(i => !isAccent(i.id)).map(i => i.id);
    for (const id of nonAccentIds) {
      expect(SHOP_ICON_IDS, `icon missing for ${id}`).toContain(id);
    }
  });

  it('renders an accent swatch filled with the ACCENT_COLORS hsl for every accent_* id', () => {
    const accents = SHOP_ITEMS.filter(i => isAccent(i.id));
    for (const item of accents) {
      const colorKey = item.id.replace('accent_', '');
      const hsl = ACCENT_COLORS[colorKey];
      const { container, unmount } = render(<ShopItemIcon id={item.id} />);
      const circles = container.querySelectorAll('circle');
      // Must have at least the ring + filled swatch
      expect(circles.length).toBeGreaterThanOrEqual(2);
      const filled = Array.from(circles).find(c =>
        c.getAttribute('fill')?.includes(hsl),
      );
      expect(filled, `accent swatch ${item.id} missing fill hsl(${hsl})`).toBeTruthy();
      unmount();
    }
  });

  it('respects the size prop', () => {
    const { container } = render(<ShopItemIcon id="focus_boost" size={40} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('40');
    expect(svg?.getAttribute('height')).toBe('40');
  });

  it('line-icons use currentColor so they can be tinted by parent', () => {
    const { container } = render(<ShopItemIcon id="focus_boost" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });

  it('falls back to a neutral circle for an unknown id', () => {
    const { container } = render(<ShopItemIcon id="not_a_real_sku" />);
    const circle = container.querySelector('circle');
    expect(circle).toBeTruthy();
  });
});
