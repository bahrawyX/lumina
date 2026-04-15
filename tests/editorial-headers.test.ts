/**
 * Editorial header rhythm — applied across every workspace page during
 * polish phase 2A. If a future refactor deletes the eyebrow tag or
 * the font-display title, these tests fail fast.
 *
 * Pattern (per page):
 *   <p className="font-mono text-[10px] uppercase tracking-[0.2em] ...">
 *     Workspace · [Section]
 *   </p>
 *   <h1 className="font-display text-2xl md:text-3xl font-medium ... tracking-[-0.035em]">
 *     [Title]
 *   </h1>
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const HEADER_PAGES = [
  ['src/components/pages/GoalsPage.tsx', 'Workspace · Objectives'],
  ['src/components/pages/ShopPage.tsx', 'Workspace · Exchange'],
  ['src/components/pages/DocsHomePage.tsx', 'Workspace · Library'],
  ['src/components/pages/IntelligencePage.tsx', 'Workspace · Account'],
  ['src/components/tasks/TaskBoard.tsx', 'Workspace · '],
] as const;

describe('Editorial header rhythm', () => {
  for (const [path, eyebrow] of HEADER_PAGES) {
    describe(path, () => {
      const code = source(path);

      it(`contains eyebrow tag: "${eyebrow}"`, () => {
        expect(code).toContain(eyebrow);
      });

      it('uses mono eyebrow with tight uppercase tracking', () => {
        expect(code).toMatch(/font-mono[^"]*uppercase[^"]*tracking-\[0\.2em\]/);
      });

      it('has a font-display title with signature negative tracking', () => {
        expect(code).toMatch(/font-display[^"]*tracking-\[-0\.035em\]/);
      });
    });
  }
});

describe('Sidebar wordmark', () => {
  const code = source('src/components/Sidebar.tsx');

  it('renders the Lumina wordmark via font-logo', () => {
    expect(code).toMatch(/font-logo/);
    expect(code).toMatch(/Lumina/);
  });
});

describe('Auth signin editorial treatment', () => {
  const code = source('src/app/auth/signin/page.tsx');

  it('uses the Begin / Return mono eyebrow', () => {
    expect(code).toMatch(/Begin/);
    expect(code).toMatch(/Return/);
    expect(code).toMatch(/tracking-\[0\.25em\]/);
  });

  it('auth card uses shadow-card instead of raw shadow-sm', () => {
    expect(code).toMatch(/shadow-card/);
  });
});
