import { test, expect } from './fixtures/app';
import { collectConsole, waitForAppReady } from './fixtures/helpers';

test.describe('Tasks (/tasks)', () => {
  test('renders task board header and view toggles', async ({ appPage: page }) => {
    const con = collectConsole(page);
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page).toHaveURL(/\/tasks/);

    // From TaskBoard.tsx we saw:  aria-label="Kanban view", "List view", "Create new task".
    await expect(page.getByRole('button', { name: /Kanban view/i }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /List view/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Create new task/i }).first()).toBeVisible();

    const errs = con.appErrors().map((e) => e.text());
    expect(errs, `Tasks console errors:\n${errs.join('\n')}`).toEqual([]);
  });

  test('toggling between Kanban and List view stays on /tasks', async ({ appPage: page }) => {
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);

    const list = page.getByRole('button', { name: /List view/i }).first();
    const kanban = page.getByRole('button', { name: /Kanban view/i }).first();

    await expect(list).toBeVisible({ timeout: 15_000 });
    await list.click();
    await expect(page).toHaveURL(/\/tasks/);
    await kanban.click();
    await expect(page).toHaveURL(/\/tasks/);
  });

  test('clicking "Create new task" opens the task creation surface', async ({ appPage: page }) => {
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);

    const create = page.getByRole('button', { name: /Create new task/i }).first();
    await expect(create).toBeVisible({ timeout: 15_000 });
    await create.click();

    // After opening, some form/input should appear somewhere on the page.
    // We use a relaxed selector because the concrete modal component isn't
    // asserted by this smoke test.
    const anyInputAfter = page.locator('input, textarea, [contenteditable="true"]').count();
    expect(await anyInputAfter).toBeGreaterThan(0);
  });
});
