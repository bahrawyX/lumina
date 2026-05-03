'use client';
// QA harness — mounts the Tiptap editor outside the auth-gated /docs/[id]
// route so the e2e suite (tests/e2e/editor.spec.ts) can exercise editor
// behavior without a real session. NODE_ENV-gated so production builds
// 404 instead of exposing a public unauthenticated editor surface.
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { notFound } from 'next/navigation';

const DocEditor = dynamic(() => import('@/components/docs/DocEditor'), { ssr: false });

export default function DevEditorTest() {
  if (process.env.NODE_ENV === 'production') notFound();

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
