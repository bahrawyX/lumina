/**
 * SEO foundation tests.
 *
 * Guards the metadata, OG images, structured data, robots, and sitemap
 * work so a future refactor can't silently strip search-engine plumbing.
 *
 * Uses the same static-analysis (readFileSync + regex) approach as
 * design-system.test.ts — no runtime rendering required.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), 'utf-8');

describe('SEO foundation', () => {
  const rootLayout = read('src/app/layout.tsx');

  it('exports metadataBase in the metadata object', () => {
    expect(rootLayout).toContain('metadataBase');
  });

  it('has a title with default and template fields', () => {
    expect(rootLayout).toContain('title:');
    expect(rootLayout).toContain('default:');
    expect(rootLayout).toContain('template:');
  });

  it('includes openGraph metadata', () => {
    expect(rootLayout).toContain('openGraph');
  });

  it('includes twitter card metadata', () => {
    expect(rootLayout).toContain('twitter');
  });

  it('includes robots metadata', () => {
    expect(rootLayout).toContain('robots');
  });

  it('includes alternates (canonical URL)', () => {
    expect(rootLayout).toContain('alternates');
  });

  it('exports viewport with themeColor', () => {
    expect(rootLayout).toContain('viewport');
    expect(rootLayout).toContain('themeColor');
  });

  it('sets lang="en" on the <html> tag', () => {
    expect(rootLayout).toMatch(/lang=["']en["']/);
  });

  it('src/app/robots.ts exists', () => {
    expect(existsSync(resolve(process.cwd(), 'src/app/robots.ts'))).toBe(true);
  });

  it('src/app/sitemap.ts exists', () => {
    expect(existsSync(resolve(process.cwd(), 'src/app/sitemap.ts'))).toBe(true);
  });

  it('public/og.png exists (static OG image)', () => {
    expect(existsSync(resolve(process.cwd(), 'public/og.png'))).toBe(true);
  });

  it('og:image in layout points to /og.png', () => {
    expect(rootLayout).toContain('/og.png');
  });

  it('app layout for authenticated routes sets noindex', () => {
    const appLayout = read('src/app/(app)/layout.tsx');
    expect(appLayout).toContain('noindex');
  });

  it('root layout includes JSON-LD structured data', () => {
    // Layout renders <JsonLd> which outputs application/ld+json
    expect(rootLayout).toContain('JsonLd');
    const jsonLdComponent = read('src/components/seo/JsonLd.tsx');
    expect(jsonLdComponent).toContain('application/ld+json');
  });
});
