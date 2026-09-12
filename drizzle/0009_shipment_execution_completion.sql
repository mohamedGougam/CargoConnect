-- Shipment completion + milestone candidates (no payments / auto-confirm)

CREATE TABLE IF NOT EXISTS "shipment_milestone_candidates" (
  "id" text PRIMARY KEY NOT NULL,
  "shipment_execution_id" text NOT NULL,
  "proposed_type" text NOT NULL,
  "source" text NOT NULL,
  "status" text NOT NULL,
  "inbound_message_id" text,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "shipment_milestone_candidates_execution_idx"
  ON "shipment_milestone_candidates" ("shipment_execution_id");
CREATE INDEX IF NOT EXISTS "shipment_milestone_candidates_status_idx"
  ON "shipment_milestone_candidates" ("shipment_execution_id", "status");
CREATE INDEX IF NOT EXISTS "shipment_milestone_candidates_inbound_idx"
  ON "shipment_milestone_candidates" ("inbound_message_id");
