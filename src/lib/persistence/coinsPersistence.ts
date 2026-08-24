/**
 * Coins persistence layer — fetches economy data from the API.
 */
import type { CoinsData } from '@/types/coins';
import { DEFAULT_CONSUMABLES } from '@/types/coins';
import { apiGetJson, type FetchResult } from './apiClient';

const isDev = process.env.NODE_ENV === 'development';

function apiBase(): string {
  return typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_APP_URL ?? '');
}

/**
 * Fetch the user's wallet, ledger and inventory.
 *
 * See `tasksPersistence.fetchAllForCurrentUser` — a failure previously returned
 * `defaultCoinsData()`, i.e. a zero balance and an empty inventory, which for an
 * economy screen is worse than an error: it tells the user they lost everything
 * they earned.
 */
export async function fetchCoinsData(): Promise<FetchResult<CoinsData>> {
  return apiGetJson<CoinsData>('/api/coins');
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
