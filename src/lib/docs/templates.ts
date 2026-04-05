/**
 * Built-in document templates for Lumina Docs.
 * Each template is a full BlockNote content array.
 */

export interface DocTemplate {
  id: string;
  title: string;
  icon: string;
  description: string;
  content: Record<string, unknown>[];
}

function heading(text: string, level: 1 | 2 | 3 = 2) {
  return {
    type: 'heading',
    props: { level },
    content: [{ type: 'text', text }],
    children: [],
  };
}

function paragraph(text: string) {
  return {
    type: 'paragraph',
    content: text ? [{ type: 'text', text }] : [],
    children: [],
  };
}

function bulletItem(text: string) {
  return {
    type: 'bulletListItem',
    content: [{ type: 'text', text }],
    children: [],
  };
}

export const TEMPLATES: DocTemplate[] = [
  {
    id: 'meeting-notes',
    title: 'Meeting Notes',
    icon: '📋',
    description: 'Capture decisions and action items',
    content: [
      heading('Meeting Notes', 1),
      heading('Attendees'),
      paragraph(''),
      heading('Agenda'),
      bulletItem('Topic 1'),
      bulletItem('Topic 2'),
      heading('Discussion'),
      paragraph(''),
      heading('Action Items'),
      bulletItem('[ ] Action item 1 — Owner'),
      bulletItem('[ ] Action item 2 — Owner'),
      heading('Next Steps'),
      paragraph(''),
    ],
  },
  {
    id: 'project-brief',
    title: 'Project Brief',
    icon: '📊',
    description: 'Define scope, goals, and timeline',
    content: [
      heading('Project Brief', 1),
      heading('Overview'),
      paragraph('Brief description of the project and its purpose.'),
      heading('Objectives'),
      bulletItem('Objective 1'),
      bulletItem('Objective 2'),
      heading('Scope'),
      paragraph('What is included and excluded.'),
      heading('Timeline'),
      paragraph('Key milestones and deadlines.'),
      heading('Resources'),
      paragraph('Team members, tools, budget.'),
      heading('Risks'),
      bulletItem('Risk 1 — Mitigation'),
    ],
  },
  {
    id: 'weekly-review',
    title: 'Weekly Review',
    icon: '✅',
    description: 'Reflect on progress and plan ahead',
    content: [
      heading('Weekly Review', 1),
      heading('What went well'),
      bulletItem(''),
      heading('What didn\'t go well'),
      bulletItem(''),
      heading('Key metrics'),
      paragraph('Tasks completed: —'),
      paragraph('Focus time: —'),
      paragraph('Events attended: —'),
      heading('Goals for next week'),
      bulletItem('Goal 1'),
      bulletItem('Goal 2'),
    ],
  },
  {
    id: 'goal-setting',
    title: 'Goal Setting',
    icon: '🎯',
    description: 'Define goals and key results',
    content: [
      heading('Goal Setting', 1),
      heading('Goal'),
      paragraph('What do you want to achieve?'),
      heading('Why it matters'),
      paragraph(''),
      heading('Key Results'),
      bulletItem('KR 1: '),
      bulletItem('KR 2: '),
      bulletItem('KR 3: '),
      heading('Milestones'),
      bulletItem('Milestone 1 — Date'),
      bulletItem('Milestone 2 — Date'),
      heading('Resources needed'),
      paragraph(''),
    ],
  },
  {
    id: 'daily-journal',
    title: 'Daily Journal',
    icon: '📝',
    description: 'Daily reflection and priorities',
    content: [
      heading('Daily Journal', 1),
      heading('Gratitude'),
      bulletItem(''),
      heading('Today\'s priorities'),
      bulletItem('Priority 1'),
      bulletItem('Priority 2'),
      bulletItem('Priority 3'),
      heading('Reflections'),
      paragraph(''),
      heading('Tomorrow\'s focus'),
      paragraph(''),
    ],
  },
  {
    id: 'sop',
    title: 'SOP / Process Guide',
    icon: '📖',
    description: 'Document a standard operating procedure',
    content: [
      heading('SOP: [Process Name]', 1),
      heading('Purpose'),
      paragraph('Why this process exists.'),
      heading('Scope'),
      paragraph('When and where this applies.'),
      heading('Prerequisites'),
      bulletItem('Prerequisite 1'),
      heading('Steps'),
      bulletItem('Step 1: '),
      bulletItem('Step 2: '),
      bulletItem('Step 3: '),
      heading('Troubleshooting'),
      bulletItem('Issue → Solution'),
    ],
  },
];

export function getTemplateById(id: string): DocTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
