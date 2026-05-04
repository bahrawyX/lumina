import { describe, it, expect } from 'vitest';
import {
  meetingNotesContent,
  weeklyReviewContent,
  projectBriefContent,
  dailyJournalContent,
  TEMPLATE_REGISTRY,
} from '@/components/docs/templates/templateContent';

// Narrow typing helper — these are JSON shapes that match Tiptap's schema
// but use Record<string, unknown> in the source so they stay decoupled.
type Node = Record<string, unknown> & { type: string; content?: Node[] };

function findNodes(doc: Node, type: string): Node[] {
  const out: Node[] = [];
  function walk(n: Node) {
    if (n.type === type) out.push(n);
    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        if (child && typeof child === 'object') walk(child as Node);
      }
    }
  }
  walk(doc);
  return out;
}

describe('meetingNotesContent()', () => {
  const doc = meetingNotesContent('Monday, May 4, 2026') as Node;

  it('returns a valid Tiptap doc node', () => {
    expect(doc.type).toBe('doc');
    expect(Array.isArray(doc.content)).toBe(true);
  });

  it('includes a heading with the supplied date', () => {
    const headings = findNodes(doc, 'heading');
    expect(headings.length).toBeGreaterThan(0);
    const stringified = JSON.stringify(headings);
    expect(stringified).toContain('Monday, May 4, 2026');
  });

  it('includes a taskList for action items', () => {
    expect(findNodes(doc, 'taskList').length).toBeGreaterThan(0);
  });

  it('has at least 5 section headings', () => {
    expect(findNodes(doc, 'heading').length).toBeGreaterThanOrEqual(5);
  });
});

describe('weeklyReviewContent()', () => {
  const completed = [
    { id: 'a1', title: 'Ship the feature', updatedAt: new Date().toISOString() },
  ];
  const overdue = [
    { id: 'a2', title: 'Fix the bug', dueDate: new Date(Date.now() - 86400000).toISOString() },
  ];
  const upcoming = [
    { id: 'a3', title: 'Write tests', dueDate: new Date(Date.now() + 86400000).toISOString() },
  ];
  const doc = weeklyReviewContent('Week of Apr 28 – May 4, 2026', completed, overdue, upcoming) as Node;

  it('returns a valid Tiptap doc node', () => {
    expect(doc.type).toBe('doc');
  });

  it('includes the week label heading', () => {
    expect(JSON.stringify(doc)).toContain('Apr 28');
  });

  it('lists each completed task title', () => {
    expect(JSON.stringify(doc)).toContain('Ship the feature');
  });

  it('lists each overdue task title', () => {
    expect(JSON.stringify(doc)).toContain('Fix the bug');
  });

  it('lists each upcoming task title', () => {
    expect(JSON.stringify(doc)).toContain('Write tests');
  });

  it('shows a completed-count in the heading', () => {
    expect(JSON.stringify(doc)).toContain('Completed (1)');
  });

  it('shows an overdue-count in the heading', () => {
    expect(JSON.stringify(doc)).toContain('Overdue (1)');
  });

  it('uses celebratory empty states when nothing is overdue or completed', () => {
    const emptyDoc = weeklyReviewContent('Week of Apr 28', [], [], []) as Node;
    const stringified = JSON.stringify(emptyDoc);
    expect(stringified).toContain('Nothing completed this week');
    expect(stringified).toContain('Nothing overdue');
  });

  it('includes the three reflection prompts', () => {
    const stringified = JSON.stringify(doc);
    expect(stringified).toContain('What went well');
    expect(stringified).toContain('What to improve');
    expect(stringified).toContain('Focus for next week');
  });

  it('renders horizontal rules between sections', () => {
    expect(findNodes(doc, 'horizontalRule').length).toBeGreaterThanOrEqual(3);
  });
});

describe('projectBriefContent()', () => {
  const doc = projectBriefContent('May 4, 2026') as Node;

  it('returns a valid Tiptap doc node', () => {
    expect(doc.type).toBe('doc');
  });

  it('has a timeline table', () => {
    expect(findNodes(doc, 'table').length).toBe(1);
  });

  it('table has milestone / date / owner columns', () => {
    const stringified = JSON.stringify(doc);
    expect(stringified).toContain('Milestone');
    expect(stringified).toContain('Date');
    expect(stringified).toContain('Owner');
  });

  it('has at least 5 H2 sections', () => {
    const h2 = findNodes(doc, 'heading').filter((h) => {
      const attrs = h.attrs as { level?: number } | undefined;
      return attrs?.level === 2;
    });
    expect(h2.length).toBeGreaterThanOrEqual(5);
  });
});

describe('dailyJournalContent()', () => {
  const tasks = [
    { id: 't1', title: 'Review PRs', status: 'todo' },
    { id: 't2', title: 'Deploy to prod', status: 'done' },
  ];
  const doc = dailyJournalContent('Monday, May 4, 2026', tasks) as Node;

  it('returns a valid Tiptap doc node', () => {
    expect(doc.type).toBe('doc');
  });

  it('mirrors today\'s tasks into a taskList', () => {
    const lists = findNodes(doc, 'taskList');
    expect(lists.length).toBe(1);
    const stringified = JSON.stringify(lists[0]);
    expect(stringified).toContain('Review PRs');
    expect(stringified).toContain('Deploy to prod');
  });

  it('marks completed tasks as checked', () => {
    const taskItems = findNodes(doc, 'taskItem');
    const checkedAny = taskItems.some((t) => {
      const attrs = t.attrs as { checked?: boolean } | undefined;
      return attrs?.checked === true;
    });
    expect(checkedAny).toBe(true);
  });

  it('falls back to a single empty taskItem when no tasks today', () => {
    const empty = dailyJournalContent('Today', []) as Node;
    const lists = findNodes(empty, 'taskList');
    expect(lists.length).toBe(1);
    expect((lists[0].content as unknown[]).length).toBe(1);
  });

  it('includes the date heading', () => {
    expect(JSON.stringify(doc)).toContain('Monday, May 4, 2026');
  });
});

describe('TEMPLATE_REGISTRY', () => {
  it('exposes 4 templates', () => {
    expect(TEMPLATE_REGISTRY.length).toBe(4);
  });

  it('flags the data-driven templates as live', () => {
    const live = TEMPLATE_REGISTRY.filter((t) => t.liveData).map((t) => t.id);
    expect(live).toEqual(expect.arrayContaining(['weekly', 'journal']));
    expect(live.length).toBe(2);
  });

  it('flags the static templates as not-live', () => {
    const meeting = TEMPLATE_REGISTRY.find((t) => t.id === 'meeting');
    const brief = TEMPLATE_REGISTRY.find((t) => t.id === 'brief');
    expect(meeting?.liveData).toBe(false);
    expect(brief?.liveData).toBe(false);
  });

  it('every template has emoji + title + description', () => {
    for (const tpl of TEMPLATE_REGISTRY) {
      expect(tpl.emoji.length).toBeGreaterThan(0);
      expect(tpl.title.length).toBeGreaterThan(0);
      expect(tpl.description.length).toBeGreaterThan(0);
    }
  });
});
