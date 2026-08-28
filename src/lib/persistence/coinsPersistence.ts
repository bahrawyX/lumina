/**
 * Coins persistence layer — fetches economy data from the API.
 */
import type { CoinsData } from '@/types/coins';
import { DEFAULT_CONSUMABLES } from '@/types/coins';
import { apiFetch, apiGetJson, ok, type FetchResult } from './apiClient';
import { GUEST_UNAVAILABLE, guestGate } from './guestGate';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Fetch the user's wallet, ledger and inventory.
 *
 * See `tasksPersistence.fetchAllForCurrentUser` — a failure previously returned
 * `defaultCoinsData()`, i.e. a zero balance and an empty inventory, which for an
 * economy screen is worse than an error: it tells the user they lost everything
 * they earned.
 */
export async function fetchCoinsData(): Promise<FetchResult<CoinsData>> {
  // F6.1: a guest has no wallet and cannot have one — the balance comes from
  // the server's ledger, with the dedupe keys and daily caps P1-3 added
  // precisely so a client cannot decide what it earned. An empty wallet is the
  // true answer here, and `guestGate` carries the copy that says why.
  const gate = guestGate<CoinsData>(defaultCoinsData(), GUEST_UNAVAILABLE.coins);
  if (gate.kind === 'guest') return ok(gate.value);
  return apiGetJson<CoinsData>('/api/coins');
}

export async function purchaseItem(itemId: string): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const gate = guestGate<null>(null, GUEST_UNAVAILABLE.purchase);
  if (gate.kind === 'guest') return { success: false, error: gate.reason };

  try {
    // P0-2: was a private `fetch` around a local `apiBase()`, so a 401 here
    // never reached `onUnauthorized` and the session-expiry watcher never
    // learned about it.
    const res = await apiFetch('/api/shop/purchase', {
      method: 'POST',
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
  if (guestGate(null).kind === 'guest') return false;

  try {
    const res = await apiFetch('/api/shop/activate-cosmetic', {
      method: 'POST',
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
