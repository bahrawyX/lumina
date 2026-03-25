ALTER TABLE "tasks" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'todo'::text;--> statement-breakpoint
DROP TYPE "public"."task_status";--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'doing', 'done');--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'todo'::"public"."task_status";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DATA TYPE "public"."task_status" USING "status"::"public"."task_status";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "category" SET DATA TYPE varchar(64);--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "category" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "color" SET DATA TYPE varchar(32);--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "color" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "color" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_start" varchar(5);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_end" varchar(5);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "remaining_focus_time" integer;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "is_completed";