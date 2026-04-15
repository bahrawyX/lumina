/**
 * Shop items config — guards the economy.
 *
 * Duplicate IDs, negative costs, or missing consumableKey on powerups
 * would break purchases silently. This test sheet covers each row.
 */
import { describe, it, expect } from 'vitest';
import { SHOP_ITEMS, SHOP_ITEM_MAP, ACCENT_COLORS } from '@/config/shopItems';

describe('SHOP_ITEMS', () => {
  it('is non-empty', () => {
    expect(SHOP_ITEMS.length).toBeGreaterThan(0);
  });

  it('has unique ids', () => {
    const ids = SHOP_ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has all positive integer costs', () => {
    for (const item of SHOP_ITEMS) {
      expect(item.cost).toBeGreaterThan(0);
      expect(Number.isInteger(item.cost)).toBe(true);
    }
  });

  it('every category is one of the three known values', () => {
    for (const item of SHOP_ITEMS) {
      expect(['powerup', 'cosmetic', 'unlock']).toContain(item.category);
    }
  });

  it('every powerup is consumable and has a consumableKey', () => {
    for (const item of SHOP_ITEMS.filter(i => i.category === 'powerup')) {
      expect(item.consumable).toBe(true);
      expect(item.consumableKey).toBeTruthy();
    }
  });

  it('every cosmetic + unlock is non-consumable', () => {
    for (const item of SHOP_ITEMS.filter(i => i.category !== 'powerup')) {
      expect(item.consumable).toBe(false);
    }
  });

  it('every accent_* cosmetic has a matching ACCENT_COLORS entry', () => {
    const accentItems = SHOP_ITEMS.filter(i => i.id.startsWith('accent_'));
    expect(accentItems.length).toBeGreaterThan(0);
    for (const item of accentItems) {
      const colorKey = item.id.replace('accent_', '');
      expect(ACCENT_COLORS[colorKey]).toBeTruthy();
      // HSL format: "H S% L%"
      expect(ACCENT_COLORS[colorKey]).toMatch(/^\d+\s+\d+%\s+\d+%$/);
    }
  });

  it('every item has a name, description, and emoji', () => {
    for (const item of SHOP_ITEMS) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.emoji.length).toBeGreaterThan(0);
    }
  });

  it('SHOP_ITEM_MAP contains the same count as SHOP_ITEMS', () => {
    expect(SHOP_ITEM_MAP.size).toBe(SHOP_ITEMS.length);
  });

  it('SHOP_ITEM_MAP resolves by id', () => {
    const first = SHOP_ITEMS[0];
    expect(SHOP_ITEM_MAP.get(first.id)).toEqual(first);
  });
});
