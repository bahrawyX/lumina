import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { GoogleGenAI, Type } from '@google/genai';

// ── Zod input validation ─────────────────────────────────────────────────────

const parseEventSchema = z.object({
  input: z.string().min(3, 'Input must be at least 3 characters').max(500, 'Input too long'),
  timezone: z.string().min(1),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid date format'),
});

// ── Gemini client (server-side only) ─────────────────────────────────────────

const apiKey = process.env.GEMINI_API_KEY ?? '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// ── Response type ────────────────────────────────────────────────────────────

interface ParsedEventData {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  recurrence: {
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    interval: number;
    weekDays: string[];
    endMode: 'never' | 'on_date' | 'after_count';
    endDate: string | null;
    endCount: number | null;
  } | null;
  confidence: number;
  ambiguities: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function isValidTime(t: unknown): t is string {
  return typeof t === 'string' && /^\d{2}:\d{2}$/.test(t);
}

function isValidDate(d: unknown): d is string {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const validation = parseEventSchema.safeParse(body);
  if (!validation.success) {
    const message = validation.error.issues[0]?.message ?? 'Invalid input';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { input, timezone, referenceDate } = validation.data;

  if (!ai) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
  }

  const systemPrompt = `You are a calendar assistant. Parse the user's natural language input into a structured calendar event.
Today's date is ${referenceDate}. User's timezone is ${timezone}.
Respond ONLY with a JSON object, no markdown, no explanation:
{
  "title": "string",
  "date": "YYYY-MM-DD",
  "startTime": "HH:mm",
  "endTime": "HH:mm",
  "isAllDay": false,
  "location": "string or null",
  "description": "string or null",
  "recurrence": {
    "frequency": "DAILY|WEEKLY|MONTHLY|YEARLY",
    "interval": 1,
    "weekDays": ["MO","TU","WE","TH","FR"],
    "endMode": "never|on_date|after_count",
    "endDate": "YYYY-MM-DD or null",
    "endCount": null
  } or null,
  "confidence": 0.0-1.0,
  "ambiguities": ["list of unclear parts if any"]
}
Rules:
- If no end time given: assume 1 hour duration
- If no date given and input is vague: use today (${referenceDate})
- "weekdays" means MO,TU,WE,TH,FR
- "every week" without a day means same day as the date given
- confidence: 1.0 if everything is clear, lower if ambiguous
- ambiguities: list anything you had to guess`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `${systemPrompt}\n\nUser input: "${input}"`,
      config: {
        maxOutputTokens: 500,
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title:       { type: Type.STRING },
            date:        { type: Type.STRING },
            startTime:   { type: Type.STRING },
            endTime:     { type: Type.STRING },
            isAllDay:    { type: Type.BOOLEAN },
            location:    { type: Type.STRING, nullable: true },
            description: { type: Type.STRING, nullable: true },
            recurrence: {
              type: Type.OBJECT,
              nullable: true,
              properties: {
                frequency: { type: Type.STRING },
                interval:  { type: Type.NUMBER },
                weekDays:  { type: Type.ARRAY, items: { type: Type.STRING } },
                endMode:   { type: Type.STRING },
                endDate:   { type: Type.STRING, nullable: true },
                endCount:  { type: Type.NUMBER, nullable: true },
              },
              required: ['frequency', 'interval', 'endMode'],
            },
            confidence:  { type: Type.NUMBER },
            ambiguities: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['title', 'date', 'startTime', 'endTime', 'confidence', 'ambiguities'],
        },
      },
    });

    const rawText = stripCodeFences(response.text?.trim() ?? '');
    if (!rawText) {
      return NextResponse.json({ error: 'Could not parse event', raw: input }, { status: 422 });
    }

    const raw = JSON.parse(rawText);

    // Sanitize and validate parsed fields
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : input.slice(0, 60);
    const date = isValidDate(raw.date) ? raw.date : referenceDate;
    const startTime = isValidTime(raw.startTime) ? raw.startTime : '09:00';
    const endTime = isValidTime(raw.endTime) ? raw.endTime : addMinutes(startTime, 60);
    const isAllDay = raw.isAllDay === true;
    const location = typeof raw.location === 'string' && raw.location.trim() ? raw.location.trim() : null;
    const description = typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : null;
    const confidence = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
    const ambiguities = Array.isArray(raw.ambiguities) ? raw.ambiguities.filter((a: unknown) => typeof a === 'string') : [];

    // Parse recurrence if present
    let recurrence: ParsedEventData['recurrence'] = null;
    if (raw.recurrence && typeof raw.recurrence === 'object') {
      const r = raw.recurrence;
      const validFreqs = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
      const validEndModes = ['never', 'on_date', 'after_count'];
      if (validFreqs.includes(r.frequency)) {
        recurrence = {
          frequency: r.frequency as ParsedEventData['recurrence'] extends null ? never : NonNullable<ParsedEventData['recurrence']>['frequency'],
          interval: typeof r.interval === 'number' && r.interval >= 1 ? r.interval : 1,
          weekDays: Array.isArray(r.weekDays) ? r.weekDays.filter((d: unknown) => typeof d === 'string') : [],
          endMode: validEndModes.includes(r.endMode) ? r.endMode : 'never',
          endDate: isValidDate(r.endDate) ? r.endDate : null,
          endCount: typeof r.endCount === 'number' && r.endCount > 0 ? r.endCount : null,
        };
      }
    }

    const parsed: ParsedEventData = {
      title,
      date,
      startTime,
      endTime,
      isAllDay,
      location,
      description,
      recurrence,
      confidence,
      ambiguities,
    };

    return NextResponse.json({ parsed, raw: input });
  } catch (err) {
    console.error('[POST /api/intelligence/parse-event]', err);
    return NextResponse.json({ error: 'Could not parse event', raw: input }, { status: 422 });
  }
}
