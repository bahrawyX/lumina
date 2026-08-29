/**
 * Lumina editor (Tiptap) — end-to-end UI regression suite.
 *
 * Strategy: drives the editor through the temporary harness route at
 * /dev-editor-test, which mounts DocEditor without auth or a real backend.
 * That isolates editor behavior from the auth gate on /docs/[id] and means
 * these tests can run in CI against an ephemeral guest session.
 *
 * The harness route exists in development-only builds. In CI / prod tests
 * against an authenticated session, point getEditorUrl() at /docs/{id}
 * instead and these expectations carry over identically.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/app';
import { collectConsole, waitForAppReady } from './fixtures/helpers';

const HARNESS_URL = '/dev-editor-test';

async function gotoEditor(page: Page) {
  await page.goto(HARNESS_URL, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.waitForSelector('.ProseMirror', { timeout: 10_000 });
}

// Click into the editor so subsequent typing is captured by ProseMirror.
async function focusEditor(page: Page) {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  return editor;
}

test.describe('Lumina Editor — Mount & Setup', () => {
  test('editor mounts without app-level console errors', async ({ appPage: page }) => {
    const con = collectConsole(page);
    await gotoEditor(page);
    // Give framer-motion's empty-state hint time to animate in
    await page.waitForTimeout(1500);
    expect(con.appErrors().map((e) => e.text())).toEqual([]);
  });

  test('placeholder text is visible when editor is empty', async ({ appPage: page }) => {
    await gotoEditor(page);
    const empty = page.locator('.ProseMirror .is-empty[data-placeholder]').first();
    await expect(empty).toBeVisible({ timeout: 5_000 });
    const placeholder = await empty.getAttribute('data-placeholder');
    expect(placeholder).toMatch(/write something/i);
  });

  test('empty-state hint appears below editor on a brand-new doc', async ({ appPage: page }) => {
    await gotoEditor(page);
    // Hint has a 500ms entrance delay + 300ms transition; give it room
    await page.waitForTimeout(1200);
    const hint = page.getByText(/start writing.*for commands/i);
    await expect(hint).toBeVisible({ timeout: 3_000 });
  });

  test('focus toggle button is visible in metadata bar', async ({ appPage: page }) => {
    await gotoEditor(page);
    // The harness's own focus toggle (production DocPage has its own with the same label)
    const focusBtn = page.getByRole('button', { name: /focus:/i });
    await expect(focusBtn.first()).toBeVisible();
  });
});

test.describe('Lumina Editor — Typing & Markdown Shortcuts', () => {
  test('typing characters appears in editor', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('Hello Tiptap');
    await expect(editor).toContainText('Hello Tiptap');
  });

  test('# space converts to H1', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('# ');
    await editor.type('My heading');
    await expect(editor.locator('h1')).toBeVisible();
    await expect(editor.locator('h1')).toContainText('My heading');
  });

  test('H1 uses Clash Display font', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('# Heading text');
    const fontFamily = await editor.locator('h1').first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toMatch(/clash/);
  });

  test('- space converts to bullet list', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('- ');
    await editor.type('first item');
    await expect(editor.locator('ul li')).toContainText('first item');
  });

  test('1. space converts to ordered list', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('1. ');
    await editor.type('first numbered');
    await expect(editor.locator('ol li')).toContainText('first numbered');
  });

  test('> space converts to blockquote', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('> A quote');
    await expect(editor.locator('blockquote')).toBeVisible();
  });

  test('``` Enter converts to code block', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('```');
    await editor.press('Enter');
    await expect(editor.locator('pre')).toBeVisible({ timeout: 3_000 });
  });
});

test.describe('Lumina Editor — Floating Toolbar', () => {
  test('toolbar appears on text selection', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('Select me to format');
    await page.keyboard.press('Control+a');
    // Toolbar buttons are aria-pressed buttons rendered inside the BubbleMenu
    await expect(page.getByRole('button', { name: 'Bold (⌘B)' })).toBeVisible({ timeout: 3_000 });
  });

  test('all 11 format buttons are present', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('Format toolbar audit');
    await page.keyboard.press('Control+a');
    const labels = ['Bold (⌘B)', 'Italic (⌘I)', 'Underline (⌘U)', 'Strikethrough', 'Inline code', 'Highlight', 'Link (⌘K)', 'Heading 1', 'Heading 2', 'Heading 3', 'Paragraph'];
    for (const label of labels) {
      await expect(page.getByRole('button', { name: label })).toBeVisible({ timeout: 3_000 });
    }
  });

  test('clicking Bold button bolds the selection', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('bold this');
    await page.keyboard.press('Control+a');
    await page.getByRole('button', { name: 'Bold (⌘B)' }).click();
    await expect(editor.locator('strong')).toBeVisible();
  });

  test('Link button switches to URL input mode', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('link this');
    await page.keyboard.press('Control+a');
    await page.getByRole('button', { name: 'Link (⌘K)' }).click();
    await expect(page.getByPlaceholder('https://...')).toBeVisible({ timeout: 2_000 });
  });
});

test.describe('Lumina Editor — Slash Menu', () => {
  test('"/" opens the slash menu with all 22 items', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('/');
    // Wait for the tippy popup
    await expect(page.locator('.tippy-box[data-theme~="lumina-slash"]')).toBeVisible({ timeout: 3_000 });
    const items = page.locator('.tippy-box[data-theme~="lumina-slash"] button[type="button"]');
    await expect(items).toHaveCount(22);
  });

  test('all three group labels render: Basic, Media, Lumina', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('/');
    const tippy = page.locator('.tippy-box[data-theme~="lumina-slash"]');
    await expect(tippy.getByText('Basic', { exact: true })).toBeVisible();
    await expect(tippy.getByText('Media', { exact: true })).toBeVisible();
    await expect(tippy.getByText('Lumina', { exact: true })).toBeVisible();
  });

  test('"/h" filters to headings (excludes Paragraph)', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('/h');
    const tippy = page.locator('.tippy-box[data-theme~="lumina-slash"]');
    await expect(tippy.getByText('Heading 1', { exact: true })).toBeVisible({ timeout: 3_000 });
    await expect(tippy.getByText('Heading 2', { exact: true })).toBeVisible();
    await expect(tippy.getByText('Heading 3', { exact: true })).toBeVisible();
    await expect(tippy.getByText('Paragraph', { exact: true })).toHaveCount(0);
  });

  test('"/xyz" shows the empty state', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('/xyzunknown');
    await expect(page.getByText(/no commands match/i)).toBeVisible({ timeout: 3_000 });
  });

  test('Escape hides the slash menu', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('/');
    const tippy = page.locator('.tippy-box[data-theme~="lumina-slash"]');
    await expect(tippy).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press('Escape');
    // tippy hides via display:none rather than unmount in our config
    await expect(tippy).not.toBeVisible({ timeout: 2_000 });
  });

  test('selecting Heading 1 inserts an H1', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('/h1');
    await page.keyboard.press('Enter');
    await expect(editor.locator('h1')).toBeVisible({ timeout: 3_000 });
  });

  test('selecting Table inserts a 3x3 table with header row', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('/table');
    await page.keyboard.press('Enter');
    await expect(editor.locator('table')).toBeVisible({ timeout: 3_000 });
    await expect(editor.locator('th')).toHaveCount(3);
    // 2 body rows × 3 cells = 6 td (header row uses th)
    await expect(editor.locator('td')).toHaveCount(6);
  });

  test('selecting Toggle inserts a collapsible block (open by default)', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('/toggle');
    await page.keyboard.press('Enter');
    const toggle = page.locator('.toggle-wrapper');
    await expect(toggle).toBeVisible({ timeout: 3_000 });
    const chevronBtn = toggle.locator('button[aria-expanded]').first();
    await expect(chevronBtn).toHaveAttribute('aria-expanded', 'true');
    // Click to close
    await chevronBtn.click();
    await expect(chevronBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('selecting Math inserts a KaTeX-rendered equation', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('/math');
    await page.keyboard.press('Enter');
    // KaTeX renders the math into a span.katex
    await expect(editor.locator('.katex').first()).toBeVisible({ timeout: 3_000 });
  });
});

test.describe('Lumina Editor — Code Block NodeView', () => {
  test('CodeBlockNodeView renders with language selector', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('/code');
    await page.keyboard.press('Enter');
    const wrapper = page.locator('.code-block-wrapper');
    await expect(wrapper).toBeVisible({ timeout: 3_000 });
    // Language selector
    const select = wrapper.locator('select[aria-label="Code language"]');
    await expect(select).toBeVisible();
    // 15 language options
    const optionCount = await select.locator('option').count();
    expect(optionCount).toBe(15);
  });

  test('changing language updates the node attr', async ({ appPage: page }) => {
    await gotoEditor(page);
    const editor = await focusEditor(page);
    await editor.type('/code');
    await page.keyboard.press('Enter');
    const select = page.locator('.code-block-wrapper select[aria-label="Code language"]');
    await select.selectOption('typescript');
    // The attr is reflected in the data-language fallback or in ProseMirror state.
    // We pull it via a quick eval rather than wrestling with the rendered DOM.
    const lang = await page.evaluate(() => {
      const w = window as unknown as { __luminaEditor?: { getJSON: () => { content?: Array<{ attrs?: { language?: string } }> } } };
      return w.__luminaEditor?.getJSON().content?.[0]?.attrs?.language;
    });
    expect(lang).toBe('typescript');
  });
});

test.describe('Lumina Editor — Focus Mode', () => {
  test('toggling focus mode adds focus-mode-active to the editor wrapper', async ({ appPage: page }) => {
    await gotoEditor(page);
    const wrapper = page.locator('.lumina-editor');
    // Initial state from the harness is focus: OFF
    await expect(wrapper).not.toHaveClass(/focus-mode-active/);
    const focusBtn = page.getByRole('button', { name: /focus: off/i });
    await focusBtn.click();
    await expect(wrapper).toHaveClass(/focus-mode-active/);
  });

  test('with focus mode on, the cursor block gets is-focused-block', async ({ appPage: page }) => {
    await gotoEditor(page);
    // Type a heading then a paragraph so we have two blocks to compare
    const editor = await focusEditor(page);
    await editor.type('# First');
    await editor.press('Enter');
    await editor.type('Second paragraph');
    // Turn on focus mode
    await page.getByRole('button', { name: /focus: off/i }).click();
    // Move cursor to second paragraph (end of doc) and verify the P is focused
    await editor.click();
    await page.keyboard.press('End');
    await expect(page.locator('.lumina-editor .ProseMirror > .is-focused-block')).toBeVisible({ timeout: 2_000 });
  });
});

test.describe('Lumina Editor — Persistence (JSON round-trip)', () => {
  test('all custom node types survive HTML round-trip', async ({ appPage: page }) => {
    await gotoEditor(page);
    // Compose a doc programmatically via the harness's exposed editor and
    // verify we can round-trip via getHTML() → setContent(html) → getJSON().
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __luminaEditor?: {
          commands: { setContent: (c: unknown) => unknown };
          getJSON: () => { content?: Array<{ type: string; attrs?: Record<string, unknown> }> };
          getHTML: () => string;
        };
      };
      const ed = w.__luminaEditor;
      if (!ed) return { ok: false };
      const original = {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
          { type: 'taskBlock', attrs: { taskId: 'abc', taskTitle: 'Do laundry', checked: true } },
          { type: 'toggle', attrs: { isOpen: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hidden' }] }] },
          { type: 'bookmark', attrs: { url: 'https://example.com', title: '' } },
          { type: 'codeBlock', attrs: { language: 'typescript' }, content: [{ type: 'text', text: 'const x = 1;' }] },
        ],
      };
      ed.commands.setContent(original);
      const html = ed.getHTML();
      ed.commands.setContent(html);
      const after = ed.getJSON();
      return {
        ok: true,
        types: after.content?.slice(0, 5).map((c) => c.type),
        taskAttrs: after.content?.[1]?.attrs,
        toggleOpen: after.content?.[2]?.attrs?.isOpen,
        bookmarkUrl: after.content?.[3]?.attrs?.url,
        codeLang: after.content?.[4]?.attrs?.language,
      };
    });

    expect(result.ok).toBe(true);
    expect(result.types).toEqual(['heading', 'taskBlock', 'toggle', 'bookmark', 'codeBlock']);
    expect(result.taskAttrs).toMatchObject({ taskId: 'abc', taskTitle: 'Do laundry', checked: true });
    expect(result.toggleOpen).toBe(false);
    expect(result.bookmarkUrl).toBe('https://example.com');
    expect(result.codeLang).toBe('typescript');
  });
});

test.describe('Lumina Editor — Mobile @mobile', () => {
  test('editor uses 16px font at 375px viewport (no iOS zoom)', async ({ appPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoEditor(page);
    const fontSize = await page.locator('.ProseMirror').evaluate((el) => getComputedStyle(el).fontSize);
    expect(fontSize).toBe('16px');
  });

  test('drag handle is hidden on mobile', async ({ appPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoEditor(page);
    // The handle markup is in the DOM but display:none via media query
    const display = await page.evaluate(() => {
      const el = document.querySelector('.drag-handle-btn');
      if (!el) return 'no-element';
      return getComputedStyle(el).display;
    });
    expect(display === 'none' || display === 'no-element').toBe(true);
  });
});
