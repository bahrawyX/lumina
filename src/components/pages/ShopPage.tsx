'use client';

import React, { useState, useMemo } from 'react';
import { useCoinsStore, selectCoinBalance, selectOwnedItems, selectActiveCosmetics } from '@/store/useCoinsStore';
import { SHOP_ITEMS, type ShopItem, ACCENT_COLORS } from '@/config/shopItems';
import { Button } from '@/components/ui/button';
import { Skeleton as SkeletonPrimitive } from '@/components/ui/skeleton';
import { Skeleton } from '@/components/ui/LoadingBoundary';
import { toast } from 'sonner';
import { ShopItemIcon } from '@/components/shop/ShopItemIcon';
import { CoinsBadge } from '@/components/coins/CoinsBadge';

// Small coin glyph used in per-item cost rows. The user's live balance is
// rendered through <CoinsBadge variant="hero" /> further down.
const CoinIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
    <circle cx="12" cy="12" r="10" /><path d="M12 6v12M8 10h8M8 14h8" />
  </svg>
);

// ── Category tabs ───────────────────────────────────────────────────────────

type Category = 'all' | 'powerup' | 'cosmetic' | 'unlock';
const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'powerup', label: 'Power-Ups' },
  { value: 'cosmetic', label: 'Cosmetics' },
  { value: 'unlock', label: 'Unlocks' },
];

// ── Shop Item Card ──────────────────────────────────────────────────────────

const ShopItemCard: React.FC<{
  item: ShopItem;
  owned: boolean;
  canAfford: boolean;
  isActive: boolean;
  onPurchase: () => void;
  onActivate?: () => void;
}> = React.memo(({ item, owned, canAfford, isActive, onPurchase, onActivate }) => (
  <div
    className="card-lift rounded-xl border border-border/70 bg-card p-4 flex flex-col gap-3 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
  >
    <div className="flex items-start gap-3">
      <div className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 ${
        item.category === 'powerup' ? 'bg-primary/10 text-primary' :
        item.category === 'cosmetic' ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' :
        'bg-amber-500/10 text-amber-600 dark:text-amber-400'
      }`}>
        <ShopItemIcon id={item.id} size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{item.name}</h3>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{item.description}</p>
      </div>
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
        item.category === 'powerup' ? 'border-primary/30 bg-primary/10 text-primary' :
        item.category === 'cosmetic' ? 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400' :
        'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
      }`}>
        {item.category === 'powerup' ? 'Power-Up' : item.category === 'cosmetic' ? 'Cosmetic' : 'Unlock'}
      </span>
    </div>

    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <CoinIcon />
        <span className="text-sm font-bold tabular-nums text-foreground">{item.cost}</span>
      </div>

      {owned && !item.consumable ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Owned</span>
          {item.id.startsWith('accent_') && onActivate && (
            <Button
              size="sm"
              variant={isActive ? 'default' : 'outline'}
              onClick={onActivate}
              className="text-[11px] h-7 rounded-lg"
            >
              {isActive ? 'Active' : 'Equip'}
            </Button>
          )}
          {item.id === 'confetti_unlock' && onActivate && (
            <Button
              size="sm"
              variant={isActive ? 'default' : 'outline'}
              onClick={onActivate}
              className="text-[11px] h-7 rounded-lg"
            >
              {isActive ? 'On' : 'Off'}
            </Button>
          )}
        </div>
      ) : (
        <Button
          size="sm"
          onClick={onPurchase}
          disabled={!canAfford}
          className="text-[11px] h-7 rounded-lg"
        >
          {item.consumable ? 'Buy' : 'Purchase'}
        </Button>
      )}
    </div>
  </div>
));
ShopItemCard.displayName = 'ShopItemCard';

// ── Main Shop Page ──────────────────────────────────────────────────────────

export default function ShopPage() {
  const balance = useCoinsStore(selectCoinBalance);
  const dbHydrated = useCoinsStore(s => s.dbHydrated);
  const ownedItems = useCoinsStore(selectOwnedItems);
  const activeCosmetics = useCoinsStore(selectActiveCosmetics);
  const purchaseItem = useCoinsStore(s => s.purchaseItem);
  const activateCosmetic = useCoinsStore(s => s.activateCosmetic);
  const consumables = useCoinsStore(s => s.consumables);
  const [category, setCategory] = useState<Category>('all');

  const filtered = useMemo(() => {
    if (category === 'all') return SHOP_ITEMS;
    return SHOP_ITEMS.filter(item => item.category === category);
  }, [category]);

  const handlePurchase = async (item: ShopItem) => {
    const success = await purchaseItem(item.id);
    if (success) {
      toast.success(`Purchased ${item.name}!`, { duration: 3000 });
    } else {
      toast.error('Purchase failed', { duration: 3000 });
    }
  };

  const handleActivateAccent = (color: string) => {
    const current = activeCosmetics.accentColor;
    activateCosmetic({ accentColor: current === color ? undefined : color });
  };

  const handleToggleConfetti = () => {
    activateCosmetic({ confetti: !activeCosmetics.confetti });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header — editorial */}
      <div className="flex items-end justify-between gap-4 mb-4 md:mb-5 pb-4 md:pb-5 border-b border-border/60 flex-shrink-0">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-1.5">
            Workspace · Exchange
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-medium text-foreground tracking-[-0.035em] leading-none">
            Shop
          </h1>
          <p className="text-[11px] md:text-xs text-muted-foreground/80 mt-2 italic">
            Spend your hard-earned coins
          </p>
        </div>
        <CoinsBadge variant="hero" />
      </div>

      {/* Active consumables */}
      {Object.entries(consumables).some(([, v]) => v > 0) && (
        <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0">
          {Object.entries(consumables).map(([key, count]) => {
            if (count <= 0) return null;
            const item = SHOP_ITEMS.find(i => i.consumableKey === key);
            return (
              <span key={key} className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-lg border border-primary/20 bg-primary/5 text-primary">
                {item && <ShopItemIcon id={item.id} size={12} />}
                {item?.name} x{count}
              </span>
            );
          })}
        </div>
      )}

      {/* Category filter */}
      <div className="flex items-center gap-1 mb-4 flex-shrink-0">
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setCategory(cat.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              category === cat.value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Items grid */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <Skeleton
          name="page.ShopPage.grid"
          loading={!dbHydrated}
          fallback={
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="rounded-xl border border-border/60 bg-card p-4 space-y-3 shadow-card">
                  <div className="flex items-start gap-3">
                    <SkeletonPrimitive className="w-8 h-8 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <SkeletonPrimitive className="h-3.5 w-2/3 rounded" />
                      <SkeletonPrimitive className="h-2.5 w-full rounded" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <SkeletonPrimitive className="h-4 w-16 rounded" />
                    <SkeletonPrimitive className="h-7 w-16 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          }
        >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
          {filtered.map(item => {
            const owned = ownedItems.includes(item.id);
            const isAccentActive = item.id.startsWith('accent_') && activeCosmetics.accentColor === item.id.replace('accent_', '');
            const isConfettiActive = item.id === 'confetti_unlock' && activeCosmetics.confetti === true;

            return (
              <ShopItemCard
                key={item.id}
                item={item}
                owned={owned}
                canAfford={balance >= item.cost}
                isActive={isAccentActive || isConfettiActive}
                onPurchase={() => handlePurchase(item)}
                onActivate={
                  item.id.startsWith('accent_') ? () => handleActivateAccent(item.id.replace('accent_', '')) :
                  item.id === 'confetti_unlock' ? handleToggleConfetti :
                  undefined
                }
              />
            );
          })}
        </div>
        </Skeleton>
      </div>
    </div>
  );
}
