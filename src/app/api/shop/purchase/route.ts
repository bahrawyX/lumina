import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { users, coinTransactions } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { SHOP_ITEM_MAP } from '@/config/shopItems';

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

    const [user] = await db
      .select({
        coins: users.coins,
        ownedItems: users.ownedItems,
        consumables: users.consumables,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.coins < item.cost) {
      return NextResponse.json({ error: 'Not enough coins' }, { status: 402 });
    }

    // For permanent items, check if already owned
    if (!item.consumable) {
      const owned = (user.ownedItems as string[]) ?? [];
      if (owned.includes(itemId)) {
        return NextResponse.json({ error: 'Already owned' }, { status: 409 });
      }
    }

    // Atomic transaction: deduct coins + insert transaction + update inventory
    const result = await db.transaction(async (tx) => {
      // Deduct coins
      const [updated] = await tx
        .update(users)
        .set({ coins: sql`${users.coins} - ${item.cost}` })
        .where(eq(users.id, userId))
        .returning({ coins: users.coins });

      // Insert transaction
      await tx.insert(coinTransactions).values({
        userId,
        amount: -item.cost,
        reason: 'shop_purchase',
        label: `Purchased ${item.name}`,
        metadata: { itemId },
      });

      // Update inventory
      if (item.consumable && item.consumableKey) {
        // Increment consumable count
        const consumables = (user.consumables as Record<string, number>) ?? {};
        const current = consumables[item.consumableKey] ?? 0;
        await tx
          .update(users)
          .set({
            consumables: sql`jsonb_set(COALESCE(${users.consumables}, '{}'), ${`{${item.consumableKey}}`}, ${String(current + 1)}::jsonb)`,
          })
          .where(eq(users.id, userId));
      } else {
        // Add to owned items
        await tx
          .update(users)
          .set({
            ownedItems: sql`COALESCE(${users.ownedItems}, '[]'::jsonb) || ${JSON.stringify([itemId])}::jsonb`,
          })
          .where(eq(users.id, userId));
      }

      return { newBalance: updated?.coins ?? 0 };
    });

    return NextResponse.json({
      success: true,
      newBalance: result.newBalance,
      item: { id: item.id, name: item.name },
    });
  } catch (err) {
    console.error('[POST /api/shop/purchase]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
