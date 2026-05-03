import { describe, it, expect } from 'vitest';
import { buildSlashItems } from '@/components/docs/slashItems';

describe('buildSlashItems()', () => {
  const items = buildSlashItems();

  it('returns exactly 22 items (Phase 6)', () => {
    expect(items.length).toBe(22);
  });

  it('every item has a non-empty title', () => {
    items.forEach((i) => {
      expect(i.title.trim().length).toBeGreaterThan(0);
    });
  });

  it('every item has a non-empty description', () => {
    items.forEach((i) => {
      expect(i.description.trim().length).toBeGreaterThan(0);
    });
  });

  it('every item has at least one alias', () => {
    items.forEach((i) => {
      expect(i.aliases.length).toBeGreaterThan(0);
    });
  });

  it('every item has an SVG icon string', () => {
    items.forEach((i) => {
      expect(typeof i.icon).toBe('string');
      expect(i.icon.trimStart().startsWith('<svg')).toBe(true);
    });
  });

  it('every item has an execute function', () => {
    items.forEach((i) => {
      expect(typeof i.execute).toBe('function');
    });
  });

  it('no duplicate titles', () => {
    const titles = items.map((i) => i.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('all groups are Basic, Media, or Lumina', () => {
    const valid = new Set(['Basic', 'Media', 'Lumina']);
    items.forEach((i) => {
      expect(valid.has(i.group)).toBe(true);
    });
  });

  // Spot-check every expected item
  const expectItem = (title: string, group: string, alias: string) => {
    it(`has "${title}" in ${group} group with alias "${alias}"`, () => {
      const item = items.find((i) => i.title === title);
      expect(item).toBeDefined();
      expect(item?.group).toBe(group);
      expect(item?.aliases).toContain(alias);
    });
  };

  expectItem('Heading 1', 'Basic', 'h1');
  expectItem('Heading 2', 'Basic', 'h2');
  expectItem('Heading 3', 'Basic', 'h3');
  expectItem('Paragraph', 'Basic', 'p');
  expectItem('Quote', 'Basic', 'blockquote');
  expectItem('Code Block', 'Basic', 'code');
  expectItem('Math', 'Basic', 'math');
  expectItem('Bullet List', 'Basic', 'ul');
  expectItem('Ordered List', 'Basic', 'ol');
  expectItem('Task List', 'Basic', 'checklist');
  expectItem('Toggle', 'Basic', 'toggle');
  expectItem('Table', 'Basic', 'table');
  expectItem('Divider', 'Basic', 'hr');
  expectItem('Page Link', 'Basic', 'page');
  expectItem('Image', 'Media', 'img');
  expectItem('Video', 'Media', 'vid');
  expectItem('Audio', 'Media', 'audio');
  expectItem('Bookmark', 'Media', 'bookmark');
  expectItem('Task', 'Lumina', 'task');
  expectItem('Columns', 'Lumina', 'columns');
  expectItem('Callout', 'Lumina', 'callout');
  expectItem('AI Assist', 'Lumina', 'ai');

  describe('filter logic (matches SlashCommandExtension behavior)', () => {
    // Mirror the filter from SlashCommandExtension.ts
    const filter = (q: string) => {
      const lower = q.toLowerCase();
      return items.filter((i) => {
        const title = i.title.toLowerCase();
        if (title.startsWith(lower)) return true;
        if (title.split(/\s+/).some((w) => w.startsWith(lower))) return true;
        if (i.aliases.some((a) => a.toLowerCase().startsWith(lower))) return true;
        return false;
      });
    };

    it('/h matches headings but NOT Paragraph', () => {
      const titles = filter('h').map((i) => i.title);
      expect(titles).toContain('Heading 1');
      expect(titles).toContain('Heading 2');
      expect(titles).toContain('Heading 3');
      expect(titles).not.toContain('Paragraph');
    });

    it('/ai matches only AI Assist', () => {
      const results = filter('ai');
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe('AI Assist');
    });

    it('/xyz returns empty', () => {
      expect(filter('xyz')).toHaveLength(0);
    });

    it('/table returns Table', () => {
      const titles = filter('table').map((i) => i.title);
      expect(titles).toContain('Table');
    });

    it('/toggle returns Toggle', () => {
      const titles = filter('toggle').map((i) => i.title);
      expect(titles).toContain('Toggle');
    });

    it('/page returns Page Link', () => {
      const titles = filter('page').map((i) => i.title);
      expect(titles).toContain('Page Link');
    });

    it('/math returns Math', () => {
      const titles = filter('math').map((i) => i.title);
      expect(titles).toContain('Math');
    });

    it('/bookmark returns Bookmark', () => {
      const titles = filter('bookmark').map((i) => i.title);
      expect(titles).toContain('Bookmark');
    });
  });
});
