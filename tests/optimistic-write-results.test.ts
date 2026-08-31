/**
 * A write the server refused must not look like one it accepted.
 *
 * P1-17 established the contract: the persistence helpers return whether the
 * server took the write, so a caller can roll the optimistic update back
 * instead of leaving a value on screen that only survives until the next
 * hydration. `useDocsStore` adopted it and says so — "roll back on error so
 * the UI never lies about what's saved."
 *
 * Several call sites never did. They fired the request, discarded the answer,
 * and announced success:
 *
 *     eventsPersistence.updateOne(event.id, body);
 *     notify(`Event updated: ${event.title}`);
 *
 * so a PATCH that 400d, 404d or never left the device produced exactly the
 * same toast as one that worked — and the edit vanished on reload. The
 * recurring-occurrence branch fifteen lines above that already handled failure
 * properly, which is what makes it a miss rather than a policy.
 *
 * `goalsPersistence.deleteOne` was worse: it awaited the fetch and dropped the
 * response without reading `res.ok`, so it could not report failure even to a
 * caller that wanted to check.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

/** Statements only — these files describe the old behaviour in their comments. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the persistence helpers report what happened', () => {
  it.each([
    ['eventsPersistence', 'updateOne'],
    ['eventsPersistence', 'deleteOne'],
    ['goalsPersistence', 'updateOne'],
    ['goalsPersistence', 'deleteOne'],
  ])('%s.%s resolves to a boolean', (module, fn) => {
    const src = read(`src/lib/persistence/${module}.ts`);
    const signature = new RegExp(`export async function ${fn}\\([^)]*\\)\\s*:\\s*Promise<boolean>`);
    expect(
      signature.test(src),
      `${module}.${fn} does not report success — a caller cannot roll back what it cannot detect`,
    ).toBe(true);
  });

  it('goals delete actually inspects the response', () => {
    // It used to `await apiFetch(...)` and discard it entirely, so a 500 and a
    // 204 were the same thing.
    const src = code(read('src/lib/persistence/goalsPersistence.ts'));
    const body = src.slice(src.indexOf('export async function deleteOne'));
    expect(body.slice(0, 600)).toMatch(/return res\.ok/);
  });
});

describe('the calendar store acts on the answer', () => {
  const store = code(read('src/store/useCalendarEventsStore.ts'));

  it.each([['updateOne'], ['deleteOne']])(
    'never calls %s without reading the result',
    (fn) => {
      /**
       * Line-based on purpose.
       *
       * The first version of this looked for a bare statement with
       * `\\([^;]*\\);` — and `[^;]*` happily spans newlines, so it matched
       * across the whole `.then(…)` block down to the first `);` inside it and
       * reported a bug in code that was already correct. A guard that cries
       * wolf gets deleted, which is worse than not having one.
       */
      const offenders = store
        .split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => line.includes(`eventsPersistence.${fn}(`))
        .filter(({ line }) => !line.includes('.then(') && !line.includes('await '));

      expect(
        offenders,
        `a fire-and-forget eventsPersistence.${fn} is back; its result decides whether to roll back`,
      ).toEqual([]);
    },
  );

  it('announces success only once the server has confirmed it', () => {
    // The specific regression: the success toast sat outside the promise, so
    // it fired before anyone knew whether the write had landed.
    expect(store).toMatch(/\.then\(\(saved\) => \{/);
    expect(store).toMatch(/\.then\(\(removed\) => \{/);
  });

  it('restores the undo history too, not just the events array', () => {
    // The optimistic write pushes a history entry. Rolling back the events
    // and leaving that entry behind would put an undo step in the stack for
    // something that never happened.
    const rollbacks = store.match(/set\(\{ events, history, historyIndex \}\)/g) ?? [];
    expect(rollbacks.length).toBeGreaterThanOrEqual(3); // update, move, delete
  });

  it('unlinks the task only after the delete is confirmed', () => {
    // Unlinking first meant a failed delete left the event in place with its
    // task link already severed.
    const del = store.slice(store.indexOf('deleteEvent:'));
    const confirm = del.indexOf('.then((removed)');
    const unlink = del.indexOf('unlinkEvent(id)');
    expect(confirm).toBeGreaterThan(-1);
    expect(unlink).toBeGreaterThan(confirm);
  });
});

describe('the goals store acts on the answer', () => {
  const store = code(read('src/store/useGoalsStore.ts'));

  it('checks whether the update was saved', () => {
    expect(store).toMatch(/const saved = await goalsPersistence\.updateOne/);
  });

  it('checks whether the delete happened', () => {
    expect(store).toMatch(/const gone = await goalsPersistence\.deleteOne/);
  });

  it('puts a failed delete back at its original index', () => {
    // Re-appending would silently reorder the list on top of the failure.
    expect(store).toMatch(/goals\.splice\(/);
  });
});
