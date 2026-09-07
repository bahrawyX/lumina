/**
 * Deleting a doc while its sidebar is open must not take down the app.
 *
 * `DocRightSidebar` did this:
 *
 *     const doc = docs.find((d) => d.id === docId);
 *     if (!doc) return null;                        // early return
 *     ...
 *     const focusTime = useMemo(() => { ... });     // hook BELOW it
 *
 * While the doc existed React counted N hooks. The moment it did not — you
 * delete the doc with the sidebar open, or a sync drops it — the component
 * returned early and React saw N-1, throwing "Rendered fewer hooks than
 * expected. This may be caused by an accidental early return statement." That
 * is a white screen, from an ordinary user action.
 *
 * The test re-renders the component across exactly that transition. It fails
 * against the original by throwing, rather than by inspecting the source, so it
 * is testing the behaviour and not the shape of the fix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

type Doc = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  linkedTaskId?: string | null;
  linkedEventId?: string | null;
};

const state = {
  docs: [] as Doc[],
  tasks: [] as unknown[],
  events: [] as unknown[],
  sessionHistory: [] as { taskId?: string; duration?: number }[],
};

/**
 * The stores are mocked, but each mock MUST consume a real hook slot.
 *
 * The first version of this file returned `sel({...})` from a plain function.
 * That made the counts 1 hook (the useMemo) with a doc and 0 without — and
 * React's "fewer hooks" check is `currentHook !== null && currentHook.next !==
 * null`, so a render that calls ZERO hooks leaves `currentHook` null and slips
 * past it entirely. The suite passed against the genuinely broken component.
 *
 * In the real app these are `useSyncExternalStore` calls, so the transition is
 * 5 hooks to 4 — React sees a leftover hook and throws. `useRef` here restores
 * that property: four real hook slots before the early return, which is what
 * makes the violation detectable.
 */
vi.mock('@/store/useDocsStore', async () => {
  const React = await import('react');
  return {
    useDocsStore: (sel: (s: unknown) => unknown) => {
      React.useRef(null);
      return sel({ docs: state.docs, openDocContent: null });
    },
  };
});
vi.mock('@/store/useTaskBoardStore', async () => {
  const React = await import('react');
  return {
    useTaskBoardStore: (sel: (s: unknown) => unknown) => {
      React.useRef(null);
      return sel({ tasks: state.tasks });
    },
  };
});
vi.mock('@/store/useCalendarEventsStore', async () => {
  const React = await import('react');
  return {
    useCalendarEventsStore: (sel: (s: unknown) => unknown) => {
      React.useRef(null);
      return sel({ events: state.events });
    },
  };
});
vi.mock('@/store/useFocusStore', async () => {
  const React = await import('react');
  return {
    useFocusStore: (sel: (s: unknown) => unknown) => {
      React.useRef(null);
      return sel({ sessionHistory: state.sessionHistory });
    },
  };
});

import DocRightSidebar from '@/components/docs/DocRightSidebar';

const DOC: Doc = {
  id: 'doc-1',
  title: 'Notes',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  wordCount: 120,
  linkedTaskId: null,
  linkedEventId: null,
};

beforeEach(() => {
  state.docs = [DOC];
  state.tasks = [];
  state.events = [];
  state.sessionHistory = [];
});

describe('the doc sidebar survives its doc disappearing', () => {
  it('renders while the doc exists', () => {
    render(<DocRightSidebar docId="doc-1" onClose={() => {}} />);
    expect(screen.getByText('Doc info')).toBeInTheDocument();
  });

  it('re-renders to nothing when the doc is deleted, without throwing', () => {
    // THE regression. The second render takes the early return; if a hook sits
    // below it, React's hook count drops and it throws.
    const { rerender, container } = render(
      <DocRightSidebar docId="doc-1" onClose={() => {}} />,
    );
    expect(screen.getByText('Doc info')).toBeInTheDocument();

    state.docs = [];

    expect(() =>
      rerender(<DocRightSidebar docId="doc-1" onClose={() => {}} />),
    ).not.toThrow();
    expect(container).toBeEmptyDOMElement();
  });

  it('survives the doc coming back', () => {
    // The same violation in the other direction — a sync restoring the doc, or
    // the user undoing the delete.
    const { rerender } = render(<DocRightSidebar docId="doc-1" onClose={() => {}} />);

    state.docs = [];
    rerender(<DocRightSidebar docId="doc-1" onClose={() => {}} />);

    state.docs = [DOC];
    expect(() =>
      rerender(<DocRightSidebar docId="doc-1" onClose={() => {}} />),
    ).not.toThrow();
    expect(screen.getByText('Doc info')).toBeInTheDocument();
  });

  it('still totals focus time for a linked task', () => {
    // The behaviour the removed `useMemo` was computing, so the fix is not just
    // "deleted the thing that crashed".
    state.docs = [{ ...DOC, linkedTaskId: 'task-1' }];
    state.sessionHistory = [
      { taskId: 'task-1', duration: 1800 },
      { taskId: 'task-1', duration: 900 },
      { taskId: 'task-2', duration: 600 },
    ];

    render(<DocRightSidebar docId="doc-1" onClose={() => {}} />);
    // 1800 + 900 = 2700s = 45m, and task-2's 600s must not be counted.
    expect(screen.getByText(/45m focused on linked task/)).toBeInTheDocument();
  });
});
