-- Operational handoff packages (immutable finalized snapshots)

CREATE TABLE IF NOT EXISTS "operational_handoffs" (
  "id" text PRIMARY KEY NOT NULL,
  "handoff_reference" text NOT NULL,
  "booking_id" text NOT NULL,
  "user_id" text NOT NULL,
  "status" text NOT NULL,
  "version" text NOT NULL,
  "supersedes_handoff_id" text,
  "finalized_at" timestamp with time zone,
  "payload" jsonb NOT NULL,
  "generated_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "operational_handoffs_reference_uidx"
  ON "operational_handoffs" ("handoff_reference");
CREATE INDEX IF NOT EXISTS "operational_handoffs_booking_idx"
  ON "operational_handoffs" ("booking_id");
CREATE INDEX IF NOT EXISTS "operational_handoffs_user_idx"
  ON "operational_handoffs" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "operational_handoffs_booking_version_uidx"
  ON "operational_handoffs" ("booking_id", "version");
