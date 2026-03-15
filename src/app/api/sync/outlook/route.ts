import { NextResponse } from "next/server";

/**
 * POST /api/sync/outlook
 * Triggers an Outlook calendar sync for the authenticated user.
 * Called by the client-side sync hook or by a background cron job.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accessToken, timezone } = body;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing access token" },
        { status: 401 }
      );
    }

    // Import dynamically to keep the server bundle smaller
    const { fetchOutlookEvents } = await import(
      "@/lib/outlook/outlookEvents"
    );

    const events = await fetchOutlookEvents(accessToken);

    return NextResponse.json({
      ok: true,
      eventCount: events.length,
      events,
    });
  } catch (error: any) {
    console.error("[API /sync/outlook]", error);
    return NextResponse.json(
      { error: error.message ?? "Sync failed" },
      { status: 500 }
    );
  }
}
