/**
 * useCoinsStore — reducer + selector tests.
 *
 * Mocks the persistence layer so we can assert optimistic-update flow
 * without hitting the API. Covers:
 *   - hydration idempotency
 *   - purchase success (both consumable + permanent paths)
 *   - purchase failure rollback
 *   - insufficient-funds rejection
 *   - invalidateBalance debounces and refetches from the server
 *   - selectors
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';

// Mock persistence BEFORE the store imports it
vi.mock('@/lib/persistence/coinsPersistence', () => ({
  purchaseItem: vi.fn(),
  activateCosmetic: vi.fn(),
  fetchCoinsData: vi.fn(),
}));

import { useCoinsStore, selectCoinBalance, selectOwnedItems } from '@/store/useCoinsStore';
import * as coinsPersistence from '@/lib/persistence/coinsPersistence';
import { DEFAULT_CONSUMABLES } from '@/types/coins';

const resetStore = () => {
  useCoinsStore.setState({
    balance: 0,
    transactions: [],
    consumables: { ...DEFAULT_CONSUMABLES },
    ownedItems: [],
    activeCosmetics: {},
    dbHydrated: false,
    isLoading: false,
  });
};

describe('useCoinsStore — hydration', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('hydrateFromDb populates state once', () => {
    useCoinsStore.getState().hydrateFromDb({
      balance: 500,
      transactions: [],
      consumables: { ...DEFAULT_CONSUMABLES, focusBoost: 3 },
      ownedItems: ['accent_purple'],
      activeCosmetics: { accentColor: 'purple' },
    });

    const state = useCoinsStore.getState();
    expect(state.balance).toBe(500);
    expect(state.ownedItems).toEqual(['accent_purple']);
    expect(state.activeCosmetics.accentColor).toBe('purple');
    expect(state.dbHydrated).toBe(true);
  });

  it('hydrateFromDb is idempotent — second call is ignored', () => {
    const store = useCoinsStore.getState();
    store.hydrateFromDb({
      balance: 100,
      transactions: [],
      consumables: DEFAULT_CONSUMABLES,
      ownedItems: [],
      activeCosmetics: {},
    });
    store.hydrateFromDb({
      balance: 9999, // should NOT overwrite
      transactions: [],
      consumables: DEFAULT_CONSUMABLES,
      ownedItems: [],
      activeCosmetics: {},
    });

    expect(useCoinsStore.getState().balance).toBe(100);
  });

  it('hydrateFromDbFailed marks hydrated without changing data', () => {
    useCoinsStore.getState().hydrateFromDbFailed();
    expect(useCoinsStore.getState().dbHydrated).toBe(true);
    expect(useCoinsStore.getState().balance).toBe(0);
  });
});

describe('useCoinsStore — purchaseItem', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    useCoinsStore.setState({ balance: 500 });
  });

  it('rejects purchase when item does not exist', async () => {
    const ok = await useCoinsStore.getState().purchaseItem('not_a_real_item');
    expect(ok).toBe(false);
    expect(useCoinsStore.getState().balance).toBe(500);
    expect(coinsPersistence.purchaseItem).not.toHaveBeenCalled();
  });

  it('rejects purchase when balance is insufficient', async () => {
    useCoinsStore.setState({ balance: 10 });
    const ok = await useCoinsStore.getState().purchaseItem('streak_shield'); // costs 100
    expect(ok).toBe(false);
    expect(useCoinsStore.getState().balance).toBe(10);
    expect(coinsPersistence.purchaseItem).not.toHaveBeenCalled();
  });

  it('consumable purchase increments the consumable counter', async () => {
    vi.mocked(coinsPersistence.purchaseItem).mockResolvedValue({
      success: true,
      newBalance: 450,
    });

    const ok = await useCoinsStore.getState().purchaseItem('focus_boost');

    expect(ok).toBe(true);
    const s = useCoinsStore.getState();
    expect(s.balance).toBe(450);
    expect(s.consumables.focusBoost).toBe(1);
    expect(s.ownedItems).not.toContain('focus_boost');
  });

  it('permanent purchase adds to ownedItems', async () => {
    vi.mocked(coinsPersistence.purchaseItem).mockResolvedValue({
      success: true,
      newBalance: 300,
    });

    const ok = await useCoinsStore.getState().purchaseItem('accent_purple');

    expect(ok).toBe(true);
    const s = useCoinsStore.getState();
    expect(s.ownedItems).toContain('accent_purple');
    expect(s.balance).toBe(300);
  });

  it('rolls back balance on server failure', async () => {
    vi.mocked(coinsPersistence.purchaseItem).mockResolvedValue({
      success: false,
    } as { success: false });

    const ok = await useCoinsStore.getState().purchaseItem('focus_boost');

    expect(ok).toBe(false);
    expect(useCoinsStore.getState().balance).toBe(500); // rolled back
    expect(useCoinsStore.getState().isLoading).toBe(false);
  });
});

describe('useCoinsStore — setBalance', () => {
  beforeEach(() => {
    resetStore();
    useCoinsStore.setState({ balance: 50 });
  });

  it('overwrites the balance with a server-supplied value', () => {
    useCoinsStore.getState().setBalance(123);
    expect(useCoinsStore.getState().balance).toBe(123);
  });

  it('floors fractional balances', () => {
    useCoinsStore.getState().setBalance(99.7);
    expect(useCoinsStore.getState().balance).toBe(99);
  });

  it('ignores negative values', () => {
    useCoinsStore.getState().setBalance(-1);
    expect(useCoinsStore.getState().balance).toBe(50);
  });

  it('ignores NaN / Infinity', () => {
    useCoinsStore.getState().setBalance(Number.NaN);
    useCoinsStore.getState().setBalance(Number.POSITIVE_INFINITY);
    expect(useCoinsStore.getState().balance).toBe(50);
  });
});

describe('useCoinsStore — invalidateBalance', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('debounces multiple invalidate calls into a single fetch', async () => {
    vi.mocked(coinsPersistence.fetchCoinsData).mockResolvedValue({
      balance: 777,
      transactions: [],
      consumables: { ...DEFAULT_CONSUMABLES },
      ownedItems: [],
      activeCosmetics: {},
    });

    const store = useCoinsStore.getState();
    store.invalidateBalance();
    store.invalidateBalance();
    store.invalidateBalance();

    // Before the debounce fires, no fetch yet.
    expect(coinsPersistence.fetchCoinsData).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(350);
    // Drain microtasks so the awaited refetchBalance() set() lands.
    await vi.runAllTimersAsync();

    expect(coinsPersistence.fetchCoinsData).toHaveBeenCalledTimes(1);
    expect(useCoinsStore.getState().balance).toBe(777);
  });
});

describe('useCoinsStore — selectors', () => {
  beforeEach(() => resetStore());

  it('selectCoinBalance reads balance', () => {
    useCoinsStore.setState({ balance: 123 });
    expect(selectCoinBalance(useCoinsStore.getState())).toBe(123);
  });

  it('selectOwnedItems reads ownedItems', () => {
    useCoinsStore.setState({ ownedItems: ['a', 'b'] });
    expect(selectOwnedItems(useCoinsStore.getState())).toEqual(['a', 'b']);
  });

  it('ownsItem returns true only for owned items', () => {
    useCoinsStore.setState({ ownedItems: ['accent_rose'] });
    expect(useCoinsStore.getState().ownsItem('accent_rose')).toBe(true);
    expect(useCoinsStore.getState().ownsItem('accent_cyan')).toBe(false);
  });
});
