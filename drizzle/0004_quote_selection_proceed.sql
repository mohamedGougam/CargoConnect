-- Quote selection + proceed requests (core commercial state — normalized tables)

CREATE TABLE IF NOT EXISTS "commercial_quote_selections" (
  "id" text PRIMARY KEY NOT NULL,
  "commercial_request_id" text NOT NULL,
  "commercial_quote_id" text NOT NULL,
  "user_id" text NOT NULL,
  "selected_at" timestamp with time zone NOT NULL,
  "selection_reason" text,
  "preference_snapshot" text,
  "active" text NOT NULL,
  "locked_at" timestamp with time zone,
  "payload" jsonb
);

CREATE INDEX IF NOT EXISTS "commercial_quote_selections_request_idx"
  ON "commercial_quote_selections" ("commercial_request_id");
CREATE INDEX IF NOT EXISTS "commercial_quote_selections_quote_idx"
  ON "commercial_quote_selections" ("commercial_quote_id");

CREATE TABLE IF NOT EXISTS "commercial_proceed_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "commercial_request_id" text NOT NULL,
  "selection_id" text NOT NULL,
  "commercial_quote_id" text NOT NULL,
  "user_id" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "commercial_proceed_requests_request_idx"
  ON "commercial_proceed_requests" ("commercial_request_id");
CREATE INDEX IF NOT EXISTS "commercial_proceed_requests_status_idx"
  ON "commercial_proceed_requests" ("status");

ALTER TABLE "commercial_messages" ADD COLUMN IF NOT EXISTS "message_kind" text;
