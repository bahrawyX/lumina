'use client';

import React, { useCallback, useState } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { cn } from '@/lib/utils';

// Languages exposed in the selector — common enough to be useful, short
// enough not to overwhelm. Lowlight (via the `common` import already wired
// in DocEditor) registers ~35+ languages; we expose the most-used set here.
const LANGUAGES = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'tsx', label: 'TSX' },
  { value: 'jsx', label: 'JSX' },
  { value: 'python', label: 'Python' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'json', label: 'JSON' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'yaml', label: 'YAML' },
] as const;

export function CodeBlockNodeView({
  node,
  updateAttributes,
  extension,
}: NodeViewProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const currentLanguage =
    (node.attrs.language as string | null) ??
    (extension.options.defaultLanguage as string | undefined) ??
    'plaintext';

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateAttributes({ language: e.target.value });
  };

  const handleCopy = useCallback(async () => {
    const text = node.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts / older browsers
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(el);
      }
    }
    setCopyState('copied');
    setTimeout(() => setCopyState('idle'), 1500);
  }, [node.textContent]);

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <div className="relative group/code">
        <div
          className="absolute right-0 top-0 flex items-center gap-1.5 px-3 py-2 pointer-events-none"
          contentEditable={false}
        >
          <select
            value={currentLanguage}
            onChange={handleLanguageChange}
            // pointer-events-auto overrides the parent so the user can interact
            className={cn(
              'pointer-events-auto appearance-none border-none outline-none cursor-pointer',
              'bg-transparent text-[11px] font-mono text-muted-foreground/60',
              'hover:text-muted-foreground transition-colors duration-150',
            )}
            aria-label="Code language"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleCopy}
            aria-label={copyState === 'copied' ? 'Copied!' : 'Copy code'}
            className={cn(
              'pointer-events-auto flex items-center gap-1 rounded px-1.5 py-0.5',
              'text-[11px] font-mono transition-all duration-150',
              'opacity-0 group-hover/code:opacity-100',
              copyState === 'copied'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground/60 hover:text-muted-foreground',
            )}
          >
            {copyState === 'copied' ? (
              <>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="4"
                    y="1"
                    width="6"
                    height="8"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M2 3.5H1.5A.5.5 0 001 4v6.5a.5.5 0 00.5.5h6a.5.5 0 00.5-.5V10"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>

        <pre className="code-block-pre">
          <NodeViewContent<'code'> as="code" />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
