/**
 * One-time migration: convert docs.content from BlockNote JSON shape (an
 * array of blocks at the root) to Tiptap JSON shape ({ type: 'doc',
 * content: [...] }). Idempotent — already-Tiptap docs are skipped.
 *
 * USAGE:
 *   1. Ensure DATABASE_URL is set in your shell or .env.local.
 *   2. Back up the docs table on staging first:
 *        pg_dump -t docs <connection_string> > docs.bak.sql
 *   3. Run on staging:
 *        npx tsx scripts/migrate-blocknote-to-tiptap.ts
 *   4. Open 3+ converted docs in the editor; verify they render.
 *   5. Run on production with the same command.
 *
 * SAFETY:
 *   - Never deletes rows.
 *   - Never overwrites without a successful conversion.
 *   - Logs every conversion + failure; exits non-zero on any failure.
 */
import { config as loadEnv } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, isNotNull } from 'drizzle-orm';
import { docs } from '../src/db/schema/docs';

// Pick up DATABASE_URL from .env.local first, then .env
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Aborting.');
  process.exit(1);
}

const db = drizzle(neon(DATABASE_URL));

// ── Format detection ─────────────────────────────────────────────────────

// Tiptap content has { type: 'doc', content: [...] } at the root.
// BlockNote content is an array at the root.
function isTiptapFormat(content: unknown): boolean {
  return (
    typeof content === 'object' &&
    content !== null &&
    !Array.isArray(content) &&
    'type' in (content as Record<string, unknown>) &&
    (content as { type?: unknown }).type === 'doc'
  );
}

// ── Inline content converter (BlockNote `styles` → Tiptap `marks`) ───────

interface BNInlineText {
  type: 'text';
  text: string;
  href?: string;
  styles?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    code?: boolean;
    textColor?: string;
    backgroundColor?: string;
  };
}

interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

function convertInline(bnContent: unknown): TiptapNode[] {
  if (!Array.isArray(bnContent)) return [];
  return bnContent.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const it = item as BNInlineText & { type?: string };
    if (it.type !== 'text') return [];
    const marks: TiptapMark[] = [];
    if (it.styles?.bold) marks.push({ type: 'bold' });
    if (it.styles?.italic) marks.push({ type: 'italic' });
    if (it.styles?.underline) marks.push({ type: 'underline' });
    if (it.styles?.strikethrough) marks.push({ type: 'strike' });
    if (it.styles?.code) marks.push({ type: 'code' });
    if (it.styles?.textColor) {
      marks.push({ type: 'textStyle', attrs: { color: it.styles.textColor } });
    }
    if (it.href) {
      marks.push({ type: 'link', attrs: { href: it.href } });
    }
    const node: TiptapNode = { type: 'text', text: it.text ?? '' };
    if (marks.length > 0) node.marks = marks;
    return [node];
  });
}

// ── Block converter — handles every BlockNote block type Lumina shipped ──

interface BNBlock {
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: BNBlock[];
}

function convertBlock(block: BNBlock): TiptapNode[] {
  const inline = convertInline(block.content);
  const hasInline = inline.length > 0;

  switch (block.type) {
    case 'paragraph':
      return [
        { type: 'paragraph', ...(hasInline ? { content: inline } : {}) },
      ];

    case 'heading': {
      const level = (block.props?.level as number) ?? 1;
      return [
        {
          type: 'heading',
          attrs: { level },
          ...(hasInline ? { content: inline } : {}),
        },
      ];
    }

    case 'bulletListItem':
    case 'numberedListItem': {
      const childBlocks = block.children ?? [];
      const childItems = childBlocks.length > 0 ? convertAndGroup(childBlocks) : [];
      // Wrap nested blocks in their own list of the same kind so list
      // continuity is preserved across migration.
      const nestedListType =
        block.type === 'bulletListItem' ? 'bulletList' : 'orderedList';
      return [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', ...(hasInline ? { content: inline } : {}) },
            ...(childItems.length > 0
              ? [{ type: nestedListType, content: childItems }]
              : []),
          ],
        },
      ];
    }

    case 'checkListItem':
      return [
        {
          type: 'taskItem',
          attrs: { checked: (block.props?.checked as boolean) ?? false },
          content: [
            { type: 'paragraph', ...(hasInline ? { content: inline } : {}) },
          ],
        },
      ];

    case 'codeBlock': {
      const language = (block.props?.language as string) ?? 'plaintext';
      // BlockNote stored code text as inline content — collapse to one
      // text node since Tiptap codeBlock content is `text*`.
      const text =
        Array.isArray(block.content)
          ? (block.content as BNInlineText[])
              .map((c) => c.text ?? '')
              .join('')
          : '';
      return [
        {
          type: 'codeBlock',
          attrs: { language },
          ...(text.length > 0
            ? { content: [{ type: 'text', text }] }
            : {}),
        },
      ];
    }

    case 'image': {
      const src =
        (block.props?.url as string) ??
        (block.props?.src as string) ??
        '';
      const alt = (block.props?.caption as string) ?? '';
      return [{ type: 'image', attrs: { src, alt } }];
    }

    case 'taskBlock':
      return [
        {
          type: 'taskBlock',
          attrs: {
            taskId: (block.props?.taskId as string | null) ?? null,
            checked: (block.props?.checked as boolean) ?? false,
            taskTitle:
              (block.props?.taskTitle as string) ??
              (block.props?.title as string) ??
              'Untitled task',
          },
        },
      ];

    case 'columnList':
      return [
        {
          type: 'columns',
          content: (block.children ?? []).map((col) => ({
            type: 'column',
            attrs: { ratio: (col.props?.ratio as number) ?? 1 },
            content: convertAndGroup(col.children ?? []),
          })),
        },
      ];

    case 'callout':
      // Older BlockNote callout — flatten into a paragraph with the emoji
      // prefix the Phase 4 slash command also produces.
      return [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '💡 ' },
            ...inline,
          ],
        },
      ];

    default:
      console.warn(
        `Unknown BlockNote block type: "${block.type}" — converting to paragraph`,
      );
      return [
        { type: 'paragraph', ...(hasInline ? { content: inline } : {}) },
      ];
  }
}

// Consecutive listItem nodes must be wrapped in a list container.
// We can't tell from a stranded listItem whether it was bullet or numbered,
// so we default to bulletList — bulletListItem is by far the more common
// case in Lumina docs (the original BlockNote slash menu defaulted to it).
function groupLists(nodes: TiptapNode[]): TiptapNode[] {
  const result: TiptapNode[] = [];
  let i = 0;
  while (i < nodes.length) {
    if (nodes[i].type === 'listItem') {
      const group: TiptapNode[] = [];
      while (i < nodes.length && nodes[i].type === 'listItem') {
        group.push(nodes[i]);
        i++;
      }
      result.push({ type: 'bulletList', content: group });
    } else {
      result.push(nodes[i]);
      i++;
    }
  }
  return result;
}

function convertBlocks(blocks: BNBlock[]): TiptapNode[] {
  return blocks.flatMap((b) => convertBlock(b));
}

function convertAndGroup(blocks: BNBlock[]): TiptapNode[] {
  return groupLists(convertBlocks(blocks));
}

function convertDoc(bnBlocks: BNBlock[]): TiptapNode {
  return { type: 'doc', content: convertAndGroup(bnBlocks) };
}

// ── Main loop ────────────────────────────────────────────────────────────

async function migrate() {
  console.log('Starting BlockNote → Tiptap migration...\n');

  const allDocs = await db
    .select({ id: docs.id, title: docs.title, content: docs.content })
    .from(docs)
    .where(isNotNull(docs.content));

  console.log(`Found ${allDocs.length} docs with content\n`);

  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of allDocs) {
    const c = doc.content;
    if (!c) {
      skipped++;
      continue;
    }
    if (isTiptapFormat(c)) {
      skipped++;
      continue;
    }
    if (!Array.isArray(c)) {
      console.warn(`✗ ${doc.id}: content is neither array nor Tiptap doc — skipped`);
      skipped++;
      continue;
    }

    try {
      const tiptap = convertDoc(c as BNBlock[]);
      await db
        .update(docs)
        .set({ content: tiptap })
        .where(eq(docs.id, doc.id));
      converted++;
      console.log(`✓ ${doc.id}: ${doc.title ?? 'Untitled'}`);
    } catch (err) {
      failed++;
      console.error(`✗ ${doc.id}:`, err);
    }
  }

  console.log(
    `\nDone: ${converted} converted, ${skipped} skipped, ${failed} failed`,
  );
  if (failed > 0) process.exit(1);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
