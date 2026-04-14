'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useCoinsStore } from '@/store/useCoinsStore';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';

export const CoinsWidget: React.FC = () => {
  const balance = useCoinsStore(s => s.balance);
  const transactions = useCoinsStore(s => s.transactions);
  const dbHydrated = useCoinsStore(s => s.dbHydrated);
  const recent = transactions.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.08 }}
      className="bg-card border border-border rounded-xl p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Coins</h3>
        <Link href="/shop" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Visit Shop
        </Link>
      </div>

      {!dbHydrated ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-28 rounded" />
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-3 w-10 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl">🪙</span>
            <span className="text-3xl font-bold tabular-nums text-foreground">{balance}</span>
          </div>

          {recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">Start completing tasks to earn coins</p>
          ) : (
            <div className="space-y-1.5">
              {recent.map(tx => {
                const isEarn = tx.amount > 0;
                return (
                  <div key={tx.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground truncate flex-1 min-w-0">{tx.label}</span>
                    <span className={`font-medium tabular-nums flex-shrink-0 ${isEarn ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                      {isEarn ? '+' : ''}{tx.amount}
                    </span>
                    <span className="text-muted-foreground/60 text-[10px] flex-shrink-0 min-w-[60px] text-right">
                      {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
};
