-- Commercial confirmations + booking foundation (no payments)

CREATE TABLE IF NOT EXISTS "commercial_confirmations" (
  "id" text PRIMARY KEY NOT NULL,
  "commercial_request_id" text NOT NULL,
  "proceed_request_id" text NOT NULL,
  "inbound_message_id" text NOT NULL,
  "user_id" text NOT NULL,
  "classification" text NOT NULL,
  "review_status" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "commercial_confirmations_request_idx"
  ON "commercial_confirmations" ("commercial_request_id");
CREATE INDEX IF NOT EXISTS "commercial_confirmations_proceed_idx"
  ON "commercial_confirmations" ("proceed_request_id");
CREATE INDEX IF NOT EXISTS "commercial_confirmations_message_idx"
  ON "commercial_confirmations" ("inbound_message_id");

CREATE TABLE IF NOT EXISTS "bookings" (
  "id" text PRIMARY KEY NOT NULL,
  "booking_reference" text NOT NULL,
  "commercial_request_id" text NOT NULL,
  "confirmation_id" text NOT NULL,
  "user_id" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "confirmed_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "bookings_reference_uidx"
  ON "bookings" ("booking_reference");
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_request_uidx"
  ON "bookings" ("commercial_request_id");
CREATE INDEX IF NOT EXISTS "bookings_user_idx"
  ON "bookings" ("user_id");
CREATE INDEX IF NOT EXISTS "bookings_confirmation_idx"
  ON "bookings" ("confirmation_id");
