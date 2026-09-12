-- Claim preparation (evidence dossier — not liability determination)

CREATE TABLE IF NOT EXISTS "claim_preparations" (
  "id" text PRIMARY KEY NOT NULL,
  "booking_id" text NOT NULL,
  "shipment_execution_id" text,
  "user_id" text NOT NULL,
  "reference" text NOT NULL,
  "status" text NOT NULL,
  "claim_type" text NOT NULL,
  "version" integer NOT NULL,
  "supersedes_claim_preparation_id" text,
  "finalized_at" timestamp with time zone,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "claim_preparations_reference_uidx"
  ON "claim_preparations" ("reference");
CREATE INDEX IF NOT EXISTS "claim_preparations_booking_idx"
  ON "claim_preparations" ("booking_id");
CREATE INDEX IF NOT EXISTS "claim_preparations_user_idx"
  ON "claim_preparations" ("user_id");
CREATE INDEX IF NOT EXISTS "claim_preparations_status_idx"
  ON "claim_preparations" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "claim_evidence_items" (
  "id" text PRIMARY KEY NOT NULL,
  "claim_preparation_id" text NOT NULL,
  "type" text NOT NULL,
  "source_id" text,
  "included" boolean NOT NULL,
  "occurred_at" timestamp with time zone,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "claim_evidence_items_claim_idx"
  ON "claim_evidence_items" ("claim_preparation_id");
CREATE INDEX IF NOT EXISTS "claim_evidence_items_source_idx"
  ON "claim_evidence_items" ("claim_preparation_id", "type", "source_id");
