'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useCoinsStore } from '@/store/useCoinsStore';
import { Skeleton as SkeletonPrimitive } from '@/components/ui/skeleton';
import { Skeleton } from 'boneyard-js/react';
import { isToday } from 'date-fns';

// ── Icons — matching TodaySummaryWidget set ───────────────────────────────────

const CoinIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 6v12M8 10h8M8 14h8" />
  </svg>
);

const ArrowUpIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
  </svg>
);

const ArrowDownIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
  </svg>
);

const BoxIcon: React.FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

// ── Widget ────────────────────────────────────────────────────────────────────

export const CoinsWidget: React.FC = () => {
  const balance       = useCoinsStore(s => s.balance);
  const transactions  = useCoinsStore(s => s.transactions);
  const ownedItems    = useCoinsStore(s => s.ownedItems);
  const consumables   = useCoinsStore(s => s.consumables);
  const dbHydrated    = useCoinsStore(s => s.dbHydrated);

  const stats = useMemo(() => {
    const todayTx = transactions.filter(t => isToday(new Date(t.createdAt)));
    const earnedToday = todayTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const spentToday  = Math.abs(todayTx.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
    const inventory   = ownedItems.length + Object.values(consumables).reduce((s, n) => s + n, 0);
    return { earnedToday, spentToday, inventory };
  }, [transactions, ownedItems, consumables]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.08 }}
      className="card-lift bg-card border border-border/70 rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Coins</h3>
        <Link href="/shop" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Visit Shop
        </Link>
      </div>

      <Skeleton
        name="dashboard.CoinsWidget"
        loading={!dbHydrated}
        fallback={
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="space-y-1.5">
                <SkeletonPrimitive className="h-3 w-16 rounded" />
                <SkeletonPrimitive className="h-6 w-12 rounded" />
              </div>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 divide-x divide-y divide-border -m-1">
          <div className="p-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-amber-500">
              <CoinIcon />
              <span className="text-[11px]">Balance</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{balance}</span>
          </div>
          <div className="p-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <BoxIcon />
              <span className="text-[11px]">Inventory</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{stats.inventory}</span>
          </div>
          <div className="p-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <ArrowUpIcon />
              <span className="text-[11px]">Earned today</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{stats.earnedToday}</span>
          </div>
          <div className="p-3 flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ArrowDownIcon />
              <span className="text-[11px]">Spent today</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-foreground">{stats.spentToday}</span>
          </div>
        </div>
      </Skeleton>
    </motion.div>
  );
};
