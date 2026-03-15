import { NextResponse } from "next/server";

/**
 * POST /api/sync/google
 * Triggers a Google Calendar sync for the authenticated user.
 * Placeholder — implement once Google OAuth tokens are stored.
 */
export async function POST(_request: Request) {
  return NextResponse.json(
    { error: "Google Calendar sync not yet implemented" },
    { status: 501 }
  );
}
