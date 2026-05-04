/**
 * Smart Templates — pure Tiptap JSON builders.
 *
 * Each function returns a Tiptap document
 * (`{ type: 'doc', content: [...] }`) ready to drop straight into the editor
 * via DocEditor's `initialContent` prop, or to persist as the doc's
 * `content` jsonb column.
 *
 * Pure module — no React, no API calls, no Zustand. Tested in isolation
 * by tests/template-content.test.ts.
 *
 * The shape mirrors the node types DocEditor registers in
 * src/components/docs/DocEditor.tsx (StarterKit + Heading + TaskList +
 * Table + custom NodeViews).
 */

// We use `Record<string, unknown>` instead of importing JSONContent from
// @tiptap/core so this module stays editor-implementation-agnostic — these
// templates feed the same shape DocEditor reads, but the function itself
// has no Tiptap dependency.
export type TiptapNode = Record<string, unknown>;
export type TiptapDoc = { type: 'doc'; content: TiptapNode[] };

// ── Builder helpers ──────────────────────────────────────────────────────

function text(value: string, marks?: TiptapNode[]): TiptapNode {
  return marks && marks.length > 0 ? { type: 'text', text: value, marks } : { type: 'text', text: value };
}

function paragraph(...inline: TiptapNode[]): TiptapNode {
  if (inline.length === 0) return { type: 'paragraph' };
  return { type: 'paragraph', content: inline };
}

function heading(level: 1 | 2 | 3, value: string): TiptapNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text: value }],
  };
}

function bulletList(items: TiptapNode[]): TiptapNode {
  return { type: 'bulletList', content: items };
}

function orderedList(items: TiptapNode[]): TiptapNode {
  return { type: 'orderedList', content: items };
}

function listItem(...children: TiptapNode[]): TiptapNode {
  return {
    type: 'listItem',
    content: children.length > 0 ? children : [paragraph()],
  };
}

function taskList(items: TiptapNode[]): TiptapNode {
  return { type: 'taskList', content: items };
}

function taskItem(checked: boolean, ...inline: TiptapNode[]): TiptapNode {
  return {
    type: 'taskItem',
    attrs: { checked },
    content: [inline.length > 0 ? paragraph(...inline) : paragraph()],
  };
}

function divider(): TiptapNode {
  return { type: 'horizontalRule' };
}

function italic(value: string): TiptapNode {
  return text(value, [{ type: 'italic' }]);
}

function muted(value: string): TiptapNode {
  // Mark inline text as muted via Tiptap's textStyle + Color extensions.
  return text(value, [
    { type: 'textStyle', attrs: { color: 'hsl(var(--muted-foreground))' } },
  ]);
}

function tableCell(...inline: TiptapNode[]): TiptapNode {
  return {
    type: 'tableCell',
    content: [inline.length > 0 ? paragraph(...inline) : paragraph()],
  };
}

function tableHeader(value: string): TiptapNode {
  return {
    type: 'tableHeader',
    content: [paragraph(text(value))],
  };
}

function tableRow(...cells: TiptapNode[]): TiptapNode {
  return { type: 'tableRow', content: cells };
}

function table(...rows: TiptapNode[]): TiptapNode {
  return { type: 'table', content: rows };
}

function doc(...nodes: TiptapNode[]): TiptapDoc {
  return { type: 'doc', content: nodes };
}

// ── Template 1: Meeting Notes ────────────────────────────────────────────

export function meetingNotesContent(date: string): TiptapDoc {
  return doc(
    heading(2, date),

    heading(3, '👥 Attendees'),
    bulletList([listItem()]),

    heading(3, '📋 Agenda'),
    orderedList([listItem()]),

    heading(3, '📝 Notes'),
    paragraph(),

    heading(3, '✅ Action Items'),
    taskList([taskItem(false)]),

    heading(3, '🎯 Decisions Made'),
    paragraph(),
  );
}

// ── Template 2: Weekly Review (data-driven) ──────────────────────────────

export interface WeeklyReviewTask {
  id: string;
  title: string;
  /** ISO timestamp — completed tasks use updatedAt, otherwise dueDate. */
  updatedAt?: string;
  /** ISO date or timestamp. */
  dueDate?: string;
}

function formatShortDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function completedItem(taskTitle: string): TiptapNode {
  return listItem(paragraph(text(taskTitle)));
}

function dueTaskItem(taskTitle: string, dueDate?: string): TiptapNode {
  const formatted = formatShortDate(dueDate);
  if (!formatted) return listItem(paragraph(text(taskTitle)));
  return listItem(paragraph(text(taskTitle), muted(` · due ${formatted}`)));
}

export function weeklyReviewContent(
  weekLabel: string,
  completedTasks: WeeklyReviewTask[],
  overdueTasks: WeeklyReviewTask[],
  upcomingTasks: WeeklyReviewTask[],
): TiptapDoc {
  return doc(
    heading(2, weekLabel),

    heading(3, `✅ Completed (${completedTasks.length})`),
    completedTasks.length > 0
      ? bulletList(completedTasks.map((t) => completedItem(t.title)))
      : paragraph(italic('Nothing completed this week.')),

    divider(),

    heading(3, `⚠️ Overdue (${overdueTasks.length})`),
    overdueTasks.length > 0
      ? bulletList(overdueTasks.map((t) => dueTaskItem(t.title, t.dueDate)))
      : paragraph(italic('Nothing overdue. 🎉')),

    divider(),

    heading(3, '📅 Coming Up Next Week'),
    upcomingTasks.length > 0
      ? bulletList(upcomingTasks.map((t) => dueTaskItem(t.title, t.dueDate)))
      : bulletList([listItem()]),

    divider(),

    heading(3, '💡 What went well?'),
    paragraph(),

    heading(3, '🔧 What to improve?'),
    paragraph(),

    heading(3, '🎯 Focus for next week'),
    paragraph(),
  );
}

// ── Template 3: Project Brief ────────────────────────────────────────────

export function projectBriefContent(_date: string): TiptapDoc {
  void _date;
  return doc(
    heading(2, '🎯 What are we building?'),
    paragraph(),

    heading(2, '❓ Why does it matter?'),
    paragraph(),

    heading(2, '👥 Who is it for?'),
    paragraph(),

    heading(2, '✅ Success looks like...'),
    bulletList([listItem()]),

    heading(2, '🚫 Out of scope'),
    bulletList([listItem()]),

    heading(2, '📅 Timeline'),
    table(
      tableRow(tableHeader('Milestone'), tableHeader('Date'), tableHeader('Owner')),
      tableRow(tableCell(), tableCell(), tableCell()),
    ),

    heading(2, '🔗 Resources & Links'),
    bulletList([listItem()]),
  );
}

// ── Template 4: Daily Journal (data-driven) ──────────────────────────────

export interface DailyJournalTask {
  id: string;
  title: string;
  status: string;
}

export function dailyJournalContent(
  date: string,
  todayTasks: DailyJournalTask[],
): TiptapDoc {
  const taskListNode =
    todayTasks.length > 0
      ? taskList(
          todayTasks.map((t) =>
            taskItem(t.status === 'done', text(t.title)),
          ),
        )
      : taskList([taskItem(false)]);

  return doc(
    heading(2, date),

    heading(3, '🌅 Morning intention'),
    paragraph(),

    heading(3, "📋 Today's tasks"),
    taskListNode,

    heading(3, '📝 Notes & thoughts'),
    paragraph(),

    heading(3, '🌙 End of day reflection'),
    paragraph(),
  );
}

// ── Template registry ────────────────────────────────────────────────────

export type TemplateId = 'meeting' | 'brief' | 'weekly' | 'journal' | 'blank';

export interface TemplateMeta {
  id: TemplateId;
  emoji: string;
  title: string;
  description: string;
  /** True when this template fetches live data from the user's tasks. */
  liveData: boolean;
}

export const TEMPLATE_REGISTRY: TemplateMeta[] = [
  {
    id: 'meeting',
    emoji: '📋',
    title: 'Meeting Notes',
    description: 'Agenda, notes, and action items in one structured doc.',
    liveData: false,
  },
  {
    id: 'brief',
    emoji: '📁',
    title: 'Project Brief',
    description: 'Goals, scope, timeline table, and resources.',
    liveData: false,
  },
  {
    id: 'weekly',
    emoji: '🔄',
    title: 'Weekly Review',
    description: 'Pulls completed and overdue tasks from your board.',
    liveData: true,
  },
  {
    id: 'journal',
    emoji: '📓',
    title: 'Daily Journal',
    description: "Today's tasks pre-filled, plus reflection prompts.",
    liveData: true,
  },
];
