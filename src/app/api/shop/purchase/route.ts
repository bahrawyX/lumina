import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { applyCoinDelta, DuplicateAwardRace } from '@/lib/coins/awardCoins';
import { SHOP_ITEM_MAP } from '@/config/shopItems';
import { apiError } from '@/lib/logger';

/** POST /api/shop/purchase — purchase a shop item */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const itemId = body.itemId as string;
  if (!itemId) {
    return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
  }

  const item = SHOP_ITEM_MAP.get(itemId);
  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  try {
    const db = getDatabase();

    // H2: check-and-debit-and-grant is now ONE transaction. The spend is a guarded
    // ledger delta (`WHERE coins >= cost` inside applyCoinDelta), so concurrent
    // purchases can never drive the balance negative, and inventory grants use
    // atomic jsonb ops on the live column (no stale-snapshot lost updates).
    const result = await db.transaction(async (tx) => {
      // Permanent items dedupe by item (owning once → idempotent + double-submit
      // safe). Consumables are repeatable, so each purchase gets a unique key.
      const dedupeKey = item.consumable
        ? `shop_purchase:${itemId}:${randomUUID()}`
        : `shop_purchase:${itemId}`;

      // Permanent item already owned? Reject on the live value inside the tx.
      if (!item.consumable) {
        const [owned] = await tx.select({ ownedItems: users.ownedItems }).from(users).where(eq(users.id, userId));
        const list = (owned?.ownedItems as string[] | null) ?? [];
        if (list.includes(itemId)) return { status: 'already_owned' as const };
      }

      const delta = await applyCoinDelta(tx, userId, {
        amount: -item.cost,
        reason: 'shop_purchase',
        label: `Purchased ${item.name}`,
        dedupeKey,
        sourceType: 'shop',
        sourceId: itemId,
        metadata: { itemId },
      });
      if (delta.status === 'insufficient_funds') return { status: 'insufficient_funds' as const };
      if (delta.status === 'duplicate') return { status: 'already_owned' as const };

      // Grant inventory atomically off the live JSON column.
      if (item.consumable && item.consumableKey) {
        await tx.update(users).set({
          consumables: sql`jsonb_set(coalesce(${users.consumables}, '{}'::jsonb), ${`{${item.consumableKey}}`}, to_jsonb(coalesce((${users.consumables}->>${item.consumableKey})::int, 0) + 1))`,
        }).where(eq(users.id, userId));
      } else {
        await tx.update(users).set({
          ownedItems: sql`coalesce(${users.ownedItems}, '[]'::jsonb) || ${JSON.stringify([itemId])}::jsonb`,
        }).where(eq(users.id, userId));
      }

      return { status: 'ok' as const, newBalance: delta.balanceAfter };
    });

    if (result.status === 'insufficient_funds') {
      return NextResponse.json({ error: 'Not enough coins' }, { status: 402 });
    }
    if (result.status === 'already_owned') {
      return NextResponse.json({ error: 'Already owned' }, { status: 409 });
    }
    return NextResponse.json({
      success: true,
      newBalance: result.newBalance,
      item: { id: item.id, name: item.name },
    });
  } catch (err) {
    if (err instanceof DuplicateAwardRace) {
      // Two concurrent buys of the same permanent item — the loser's tx rolled
      // back (no charge). That's "already owned", not a server error.
      return NextResponse.json({ error: 'Already owned' }, { status: 409 });
    }
    return apiError('POST /api/shop/purchase', err);
  }
}
