/**
 * useCoinsStore — reducer + selector tests.
 *
 * Mocks the persistence layer so we can assert optimistic-update flow
 * without hitting the API. Covers:
 *   - hydration idempotency
 *   - purchase success (both consumable + permanent paths)
 *   - purchase failure rollback
 *   - insufficient-funds rejection
 *   - addEarnedCoins capping transactions at 50
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

describe('useCoinsStore — addEarnedCoins', () => {
  beforeEach(() => resetStore());

  it('adds to balance', () => {
    useCoinsStore.getState().addEarnedCoins(25);
    expect(useCoinsStore.getState().balance).toBe(25);
  });

  it('prepends a transaction when provided', () => {
    useCoinsStore.getState().addEarnedCoins(10, {
      id: 'tx1',
      amount: 10,
      reason: 'task_complete',
      label: 'Test reward',
      createdAt: new Date().toISOString(),
    });
    expect(useCoinsStore.getState().transactions[0].id).toBe('tx1');
  });

  it('caps transaction history at 50 entries', () => {
    // pre-fill with 50 transactions
    const existing = Array.from({ length: 50 }).map((_, i) => ({
      id: `old_${i}`,
      amount: 1,
      reason: 'task_complete',
      label: `old ${i}`,
      createdAt: new Date().toISOString(),
    }));
    useCoinsStore.setState({ transactions: existing });

    useCoinsStore.getState().addEarnedCoins(5, {
      id: 'new_tx',
      amount: 5,
      reason: 'task_complete',
      label: 'new',
      createdAt: new Date().toISOString(),
    });

    const txs = useCoinsStore.getState().transactions;
    expect(txs).toHaveLength(50);
    expect(txs[0].id).toBe('new_tx');
    // oldest was dropped
    expect(txs.find(t => t.id === 'old_49')).toBeUndefined();
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
