import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { contactSubmissions } from '@/db/schema';
import {
  contactTypeSchema,
  contactSubjectSchema,
  contactMessageSchema,
  contactEmailSchema,
} from '@/lib/validation';
import { clientIp, createRateLimiter, rateLimitedResponse } from '@/lib/rateLimit';
import { apiError } from '@/lib/logger';

/**
 * `/api/contact` is the only unauthenticated write endpoint in the app, so it
 * gets two ceilings.
 *
 * The previous limiter was a `Map` keyed on the raw `x-forwarded-for` header:
 * a client-supplied string. Rotating it per request removed the 60s cooldown
 * entirely, while each spoofed value added a permanent Map entry — an
 * attacker-controlled memory leak. `clientIp()` now reads only headers the
 * platform sets and cannot be spoofed past.
 */
const perSubmitterLimiter = createRateLimiter('contact', { windowMs: 60_000, max: 1 });

/**
 * A global hourly ceiling, because a per-IP limit alone does nothing against a
 * distributed flood, and every accepted submission is a row in the database.
 */
const globalLimiter = createRateLimiter('contactGlobal', { windowMs: 60 * 60 * 1000, max: 200 });

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

  // P3-2: this was stored with only a `typeof string` check — no format
  // validation and no length cap — while `subject` (100) and `message` (1000)
  // were properly bounded by the same module. `emailSchema` already existed and
  // simply was not used here.
  //
  // The CRLF strip is not theoretical hygiene: this value is the reply-to for
  // whatever eventually processes these submissions, and a newline in an
  // address is how header injection starts.
  let email: string | null = null;
  if (body.email !== undefined && body.email !== null && body.email !== '') {
    const emailResult = contactEmailSchema.safeParse(body.email);
    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error.issues[0]?.message ?? 'Invalid email address' },
        { status: 400 },
      );
    }
    email = emailResult.data;
  }

  // Rate limit BEFORE the insert. The timestamp used to be recorded *after* a
  // successful insert, so N concurrent requests all passed the check before any
  // of them wrote.
  const subject = userId ?? clientIp(req.headers);
  const perSubmitter = await perSubmitterLimiter.check(subject);
  if (perSubmitter.limited) {
    return rateLimitedResponse(
      perSubmitter.retryAfterMs,
      'Please wait a minute before submitting again.',
    );
  }
  const global = await globalLimiter.check('all');
  if (global.limited) {
    return rateLimitedResponse(global.retryAfterMs, 'Too many submissions right now.');
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

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return apiError('POST /api/contact', err);
  }
}
