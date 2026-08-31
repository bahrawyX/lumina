'use client';
/**
 * QA harness — mounts the Tiptap editor outside the auth-gated `/docs/[id]`
 * route so `tests/e2e/editor.spec.ts` can exercise editor behaviour without a
 * real session.
 *
 * The gate is an explicit opt-in, not `NODE_ENV`.
 *
 * It used to be `if (process.env.NODE_ENV === 'production') notFound()`, which
 * reads correctly and broke CI. The e2e job builds the app and runs
 * `next start` — deliberately, because e2e should exercise the bundle that
 * ships — and `next start` sets `NODE_ENV=production`. So this route 404d on
 * every CI run and all twenty-nine editor specs failed with
 * `waiting for locator('.ProseMirror')`. A permanently red job is worse than
 * no job; it gets ignored, and then it hides a real failure.
 *
 * `E2E_EDITOR_HARNESS` says what is actually meant: this page exists for the
 * test runner. CI sets it, a real deployment does not, and the route stays
 * unreachable in production — which was the point of the original gate.
 *
 * `NEXT_PUBLIC_` prefix because the check runs in a client component; without
 * it the variable is not inlined into the bundle and the value is always
 * `undefined` here.
 */
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { notFound } from 'next/navigation';

const DocEditor = dynamic(() => import('@/components/docs/DocEditor'), { ssr: false });

export default function DevEditorTest() {
  // Dev always; a built bundle only when the runner explicitly asks for it.
  const enabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_E2E_EDITOR_HARNESS === '1';
  if (!enabled) notFound();

  const [words, setWords] = useState(0);
  const [lastSave, setLastSave] = useState<string>('—');
  const [focusMode, setFocusMode] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold mb-1">Editor QA harness</h1>
        <div className="mb-4 flex items-center gap-3 text-xs font-mono text-muted-foreground">
          <span>words: {words}</span>
          <span>·</span>
          <span>last onUpdate: {lastSave}</span>
          <span>·</span>
          <button
            type="button"
            onClick={() => setFocusMode((v) => !v)}
            className="rounded px-2 py-0.5 border border-border"
          >
            focus: {focusMode ? 'ON' : 'OFF'}
          </button>
        </div>
        <div suppressHydrationWarning>
          <DocEditor
            docId="qa-test"
            initialContent={null}
            onUpdate={(_content, text, w) => {
              setLastSave(`${new Date().toISOString().slice(11, 19)} (${text.length} chars, ${w} words)`);
            }}
            onWordCountChange={setWords}
            focusMode={focusMode}
            className="min-h-[400px]"
          />
        </div>
      </div>
    </div>
  );
}
