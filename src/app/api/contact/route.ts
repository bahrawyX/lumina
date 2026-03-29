import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { contactSubmissions } from '@/db/schema';
import { contactTypeSchema, contactSubjectSchema, contactMessageSchema } from '@/lib/validation';

// Simple in-memory rate limiting (per userId, 60s cooldown)
const lastSubmission = new Map<string, number>();

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  const userId = session?.user?.id ?? null;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate fields
  const typeResult = contactTypeSchema.safeParse(body.type);
  if (!typeResult.success) {
    return NextResponse.json({ error: 'Invalid contact type' }, { status: 400 });
  }

  const subjectResult = contactSubjectSchema.safeParse(body.subject);
  if (!subjectResult.success) {
    return NextResponse.json({ error: subjectResult.error.issues[0]?.message ?? 'Invalid subject' }, { status: 400 });
  }

  const messageResult = contactMessageSchema.safeParse(body.message);
  if (!messageResult.success) {
    return NextResponse.json({ error: messageResult.error.issues[0]?.message ?? 'Invalid message' }, { status: 400 });
  }

  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;

  // Rate limit
  const rateLimitKey = userId ?? req.headers.get('x-forwarded-for') ?? 'anon';
  const lastTime = lastSubmission.get(rateLimitKey);
  if (lastTime && Date.now() - lastTime < 60_000) {
    return NextResponse.json(
      { error: 'Please wait a minute before submitting again' },
      { status: 429 },
    );
  }

  try {
    const db = getDatabase();
    await db.insert(contactSubmissions).values({
      userId,
      type: typeResult.data,
      subject: subjectResult.data,
      message: messageResult.data,
      email,
    });

    lastSubmission.set(rateLimitKey, Date.now());

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/contact]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
