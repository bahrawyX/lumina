import { create } from 'zustand';
import type { CoinTransaction, ConsumableKey, ActiveCosmetics } from '@/types/coins';
import { DEFAULT_CONSUMABLES } from '@/types/coins';
import * as coinsPersistence from '@/lib/persistence/coinsPersistence';
import { SHOP_ITEM_MAP } from '@/config/shopItems';

interface CoinsState {
  balance: number;
  transactions: CoinTransaction[];
  consumables: Record<ConsumableKey, number>;
  ownedItems: string[];
  activeCosmetics: ActiveCosmetics;
  dbHydrated: boolean;
  isLoading: boolean;

  // Hydration
  hydrateFromDb: (data: {
    balance: number;
    transactions: CoinTransaction[];
    consumables: Record<ConsumableKey, number>;
    ownedItems: string[];
    activeCosmetics: ActiveCosmetics;
  }) => void;
  hydrateFromDbFailed: () => void;

  // Actions
  purchaseItem: (itemId: string) => Promise<boolean>;
  activateCosmetic: (patch: Partial<ActiveCosmetics>) => Promise<boolean>;
  addEarnedCoins: (amount: number, tx?: CoinTransaction) => void;
  /**
   * Re-pull the canonical coin balance + transactions from GET /api/coins.
   * Called after a focus session finishes so the UI reflects the DB-side
   * total (streakUpdate.coins + any async awardCoinsBatch bonuses) instead
   * of a best-guess delta. useCoinsStore is the single source of truth —
   * useStreakStore no longer tracks `coins`.
   */
  refetchBalance: () => Promise<void>;

  // Selectors
  ownsItem: (itemId: string) => boolean;
  getConsumable: (key: ConsumableKey) => number;
}

export const useCoinsStore = create<CoinsState>((set, get) => ({
  balance: 0,
  transactions: [],
  consumables: DEFAULT_CONSUMABLES,
  ownedItems: [],
  activeCosmetics: {},
  dbHydrated: false,
  isLoading: false,

  hydrateFromDb: (data) => {
    if (get().dbHydrated) return;
    set({
      dbHydrated: true,
      balance: data.balance,
      transactions: data.transactions,
      consumables: data.consumables,
      ownedItems: data.ownedItems,
      activeCosmetics: data.activeCosmetics,
    });
  },

  hydrateFromDbFailed: () => {
    if (get().dbHydrated) return;
    set({ dbHydrated: true });
  },

  purchaseItem: async (itemId) => {
    const item = SHOP_ITEM_MAP.get(itemId);
    if (!item) return false;
    if (get().balance < item.cost) return false;

    // Optimistic deduct
    set(s => ({ balance: s.balance - item.cost, isLoading: true }));

    const result = await coinsPersistence.purchaseItem(itemId);
    if (result.success) {
      set(s => {
        const next: Partial<CoinsState> = {
          balance: result.newBalance ?? s.balance,
          isLoading: false,
        };
        if (item.consumable && item.consumableKey) {
          next.consumables = {
            ...s.consumables,
            [item.consumableKey]: (s.consumables[item.consumableKey] ?? 0) + 1,
          };
        } else {
          next.ownedItems = [...s.ownedItems, itemId];
        }
        return next;
      });
      return true;
    } else {
      // Rollback
      set(s => ({ balance: s.balance + item.cost, isLoading: false }));
      return false;
    }
  },

  activateCosmetic: async (patch) => {
    const prev = get().activeCosmetics;
    // Optimistic update
    set(s => ({ activeCosmetics: { ...s.activeCosmetics, ...patch } }));

    const success = await coinsPersistence.activateCosmetic(patch);
    if (!success) {
      // Rollback
      set({ activeCosmetics: prev });
    }
    return success;
  },

  addEarnedCoins: (amount, tx) => {
    set(s => ({
      balance: s.balance + amount,
      transactions: tx ? [tx, ...s.transactions.slice(0, 49)] : s.transactions,
    }));
  },

  refetchBalance: async () => {
    try {
      const data = await coinsPersistence.fetchCoinsData();
      set({
        balance: data.balance,
        transactions: data.transactions,
        consumables: data.consumables,
        ownedItems: data.ownedItems,
        activeCosmetics: data.activeCosmetics,
      });
    } catch {
      // Swallow — keep optimistic state if the refetch fails. The next
      // PersistenceBootstrap cycle or a subsequent session will retry.
    }
  },

  ownsItem: (itemId) => get().ownedItems.includes(itemId),
  getConsumable: (key) => get().consumables[key] ?? 0,
}));

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectCoinBalance = (state: CoinsState) => state.balance;
export const selectActiveCosmetics = (state: CoinsState) => state.activeCosmetics;
export const selectOwnedItems = (state: CoinsState) => state.ownedItems;
export const selectConsumables = (state: CoinsState) => state.consumables;
