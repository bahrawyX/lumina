import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { apiError } from '@/lib/logger';

/**
 * DELETE /api/users/me — erase the account and everything in it.
 *
 * P2-14: there was no account deletion anywhere in the product. Every child
 * table already cascades from `users`, so the database was ready for it; there
 * was simply no endpoint, no soft-delete flag, and no export. For a product
 * storing calendar contents, document bodies and mood logs, that is a GDPR
 * Article 17 gap, not a missing nice-to-have.
 *
 * The actual deletion is BetterAuth's `/delete-user`, not a hand-rolled
 * transaction, because it re-verifies the caller before doing anything
 * irreversible:
 *
 *   - a **credential** account must supply its current password;
 *   - an **OAuth-only** account must be on a session created inside `freshAge`
 *     (24h), so a stolen long-lived cookie cannot erase someone's data.
 *
 * It then deletes the user row (cascades take the rest), drops every session
 * row so other devices are logged out too, and clears the cookie. The response
 * is forwarded verbatim so that `Set-Cookie` reaches the browser.
 *
 * This route adds one thing on top: an explicit `confirm: "DELETE"` in the
 * body. A destructive endpoint reachable by a bare `fetch('/api/users/me',
 * {method:'DELETE'})` is one mis-wired button away from an accident.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { confirm?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Send {"confirm":"DELETE"} to confirm account deletion' },
      { status: 400 },
    );
  }

  const password = typeof body.password === 'string' ? body.password : undefined;

  try {
    // `asResponse` so BetterAuth's own status codes and the session-clearing
    // `Set-Cookie` reach the client unchanged. Re-wrapping the JSON would drop
    // the cookie and leave the browser holding a token for a user that no
    // longer exists.
    return await auth.api.deleteUser({
      body: password ? { password } : {},
      headers: req.headers,
      asResponse: true,
    });
  } catch (err) {
    // A wrong password or a stale session surfaces here as an APIError with its
    // own status; anything else is ours.
    const status = (err as { status?: unknown })?.status;
    if (typeof status === 'number') {
      return NextResponse.json(
        { error: 'Could not delete account. Re-authenticate and try again.' },
        { status },
      );
    }
    if (typeof status === 'string') {
      return NextResponse.json(
        { error: 'Could not delete account. Re-authenticate and try again.' },
        { status: 400 },
      );
    }
    return apiError('DELETE /api/users/me', err, { userId: session.user.id });
  }
}
