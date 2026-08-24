# Migrations

## Rules

1. **Never run `drizzle-kit push`.** The `db:push` script has been removed on
   purpose. `push` reconciles by diffing and silently drops DB-only objects —
   CHECK constraints and partial unique indexes among them. The coin ledger's
   at-most-once guarantee rests on `coin_tx_user_dedupe_uniq`, a *partial*
   unique index; losing it makes double-awards silently possible.

2. **Schema changes go: edit `src/db/schema/*.ts` → `npm run db:generate` →
   review the emitted SQL → commit → `npm run db:migrate` in the deploy step.**

3. **Model every constraint in the Drizzle schema**, not just in raw SQL. An
   unmodelled constraint has no representation for `generate` to preserve.

## How this got into its current shape

Before `0020_schema_baseline`:

- Four production tables — `docs`, `goals`, `goal_targets`, `coin_transactions`
  — existed in **no migration at all**. They were defined only in
  `src/db/schema/` and reached production via `drizzle-kit push`.
- Eleven declared indexes were in the same position, including the `docs`
  full-text GIN index and `coin_tx_user_created_idx`.
- `meta/_journal.json` listed entries 0–8 while 20 `.sql` files sat on disk, so
  `drizzle-kit migrate` would have skipped 0009–0019 entirely.
- There was no `db:migrate` script.

Net effect: **the database could not be rebuilt from the repository.** You could
not stand up a new environment, could not roll back a schema change, and did not
know what any given environment actually contained.

## What `0020_schema_baseline.sql` is

A complete, **idempotent** baseline for the entire schema, generated from
`src/db/schema/*.ts` by `drizzle-kit generate` (no database was contacted to
produce it) and then rewritten so every statement is safe to re-run:

| statement | made idempotent by |
|---|---|
| `CREATE TABLE` | `IF NOT EXISTS` |
| `CREATE INDEX` / `CREATE UNIQUE INDEX` | `IF NOT EXISTS` |
| `CREATE TYPE` (enums) | `DO` block swallowing `duplicate_object` |
| `ALTER TABLE … ADD CONSTRAINT` | `DO` block swallowing `duplicate_object` |

It is **additive only**. Nothing in it drops, alters or recreates an existing
object, and no data is touched. So it is a no-op against the current production
database and produces the full, correct schema against an empty one.

`tests/migrations-baseline.test.ts` proves both properties against a real
in-process Postgres: it applies the file to an empty database and asserts every
declared table exists, then applies it a **second** time and asserts no error —
which is exactly the production case.

The historical `0000`–`0019` files are kept for the record and stay ahead of the
baseline in the journal, so an environment part-way through the old chain still
converges here.

## Remaining step — needs database access

The migration **snapshots** (`meta/*_snapshot.json`) are still incomplete: only
`0000`, `0001`, `0002`, `0005` and `0006` exist. `drizzle-kit generate` diffs
against the newest snapshot, so until the chain is rebuilt, the next `generate`
will diff against the stale `0006` snapshot and emit a destructive
"recreate everything" migration.

Fixing that requires reading the real production schema, which is a database
operation and is deliberately not done here. When you're ready, against a
**Neon branch of production** (never production itself):

```bash
npx drizzle-kit introspect --config=drizzle.config.ts
```

Then reconcile the introspected snapshot into `drizzle/meta/` as the snapshot
for `0020_schema_baseline`, and verify with:

```bash
npm run db:generate
```

which must report **no changes**. Until that reports no changes, treat
`db:generate` output as untrustworthy and hand-write migrations.

## Verifying production matches the repo

Run `scripts/verify-schema.sql` against production (read-only) and compare the
output to `EXPECTED_TABLES` in `tests/migrations-baseline.test.ts`.
