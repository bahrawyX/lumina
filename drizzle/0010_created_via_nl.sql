DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'created_via_nl') THEN
    ALTER TABLE "events" ADD COLUMN "created_via_nl" boolean NOT NULL DEFAULT false;
  END IF;
END $$;
