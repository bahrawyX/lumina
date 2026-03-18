CREATE TYPE "public"."event_provider" AS ENUM('local', 'google', 'outlook');--> statement-breakpoint
CREATE TYPE "public"."event_sync_status" AS ENUM('local_only', 'synced', 'pending_update', 'pending_delete');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('active', 'disconnected', 'error');--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'archived';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'outlook';--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "category" text DEFAULT 'work' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "color" text DEFAULT '#6D59E0' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "linked_task_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "provider" "event_provider" DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "external_event_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "external_etag" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "sync_status" "event_sync_status" DEFAULT 'local_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "organizer_email" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "token_type" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "status" "integration_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_linked_task_id_tasks_id_fk" FOREIGN KEY ("linked_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "events"
SET "external_event_id" = "external_id"
WHERE "external_event_id" IS NULL
	AND "external_id" IS NOT NULL;--> statement-breakpoint
UPDATE "events"
SET "source_updated_at" = "last_synced_at"
WHERE "source_updated_at" IS NULL
	AND "last_synced_at" IS NOT NULL;--> statement-breakpoint
UPDATE "events"
SET "provider" = CASE
	-- Explicit legacy source -> canonical provider mapping:
	-- lumina/local/manual/scheduler -> local
	-- outlook/microsoft -> outlook
	-- google -> google
	WHEN "source"::text = 'lumina' THEN 'local'::"event_provider"
	WHEN "source"::text = 'local' THEN 'local'::"event_provider"
	WHEN "source" = 'manual' THEN 'local'::"event_provider"
	WHEN "source" = 'scheduler' THEN 'local'::"event_provider"
	WHEN "source" = 'google' THEN 'google'::"event_provider"
	WHEN "source"::text = 'outlook' THEN 'outlook'::"event_provider"
	WHEN "source" = 'microsoft' THEN 'outlook'::"event_provider"
	ELSE 'local'::"event_provider"
END;--> statement-breakpoint
UPDATE "events"
SET "sync_status" = CASE
	WHEN "external_event_id" IS NOT NULL OR "source_updated_at" IS NOT NULL THEN 'synced'::"event_sync_status"
	ELSE 'local_only'::"event_sync_status"
END;--> statement-breakpoint
WITH ranked_local_calendars AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "user_id"
			ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
		) AS rn
	FROM "calendars"
	WHERE "provider" = 'local'
		AND "is_primary" = true
)
UPDATE "calendars" c
SET "is_primary" = false
FROM ranked_local_calendars r
WHERE c."id" = r."id"
	AND r.rn > 1;--> statement-breakpoint
WITH ranked_external_events AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "calendar_id", "external_event_id"
			ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
		) AS rn
	FROM "events"
	WHERE "external_event_id" IS NOT NULL
)
UPDATE "events" e
SET "external_event_id" = NULL
FROM ranked_external_events r
WHERE e."id" = r."id"
	AND r.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_one_primary_local_per_user" ON "calendars" USING btree ("user_id") WHERE "calendars"."provider" = 'local' and "calendars"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "events_calendar_start_time_idx" ON "events" USING btree ("calendar_id","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "events_calendar_external_event_unique" ON "events" USING btree ("calendar_id","external_event_id") WHERE "events"."external_event_id" is not null;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_estimated_minutes_check" CHECK ("tasks"."estimated_minutes" > 0);