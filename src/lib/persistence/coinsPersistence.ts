/**
 * Coins persistence layer — fetches economy data from the API.
 */
import type { CoinsData } from '@/types/coins';
import { DEFAULT_CONSUMABLES } from '@/types/coins';

const isDev = process.env.NODE_ENV === 'development';

function apiBase(): string {
  return typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_APP_URL ?? '');
}

export async function fetchCoinsData(): Promise<CoinsData> {
  try {
    const res = await fetch(`${apiBase()}/api/coins`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return defaultCoinsData();
    return await res.json();
  } catch {
    if (isDev) console.error('[coinsPersistence.fetchCoinsData] failed');
    return defaultCoinsData();
  }
}

export async function purchaseItem(itemId: string): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  try {
    const res = await fetch(`${apiBase()}/api/shop/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error ?? 'Purchase failed' };
    return { success: true, newBalance: data.newBalance };
  } catch {
    return { success: false, error: 'Network error' };
  }
}

export async function activateCosmetic(patch: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/shop/activate-cosmetic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function defaultCoinsData(): CoinsData {
  return {
    balance: 0,
    transactions: [],
    consumables: DEFAULT_CONSUMABLES,
    ownedItems: [],
    activeCosmetics: {},
  };
}
