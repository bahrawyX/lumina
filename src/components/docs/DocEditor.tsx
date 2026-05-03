'use client';
// TEMPORARY STUB — replaced in Prompt 2.
// Accepts (and ignores) the props DocPage.tsx passes so the app still
// typechecks while the editor is being reimplemented on Tiptap.

interface DocEditorProps {
  docId: string;
  initialContent?: unknown;
  onChange?: (blocks: unknown[], plainText: string, wordCount: number) => void;
  className?: string;
}

export default function DocEditor(_props: DocEditorProps) {
  return (
    <div className="p-8 text-sm text-muted-foreground italic">
      Editor migration in progress…
    </div>
  );
}
