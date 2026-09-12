-- Changed-terms acceptance snapshots + booking documents (no payments)

CREATE TABLE IF NOT EXISTS "accepted_commercial_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "commercial_request_id" text NOT NULL,
  "confirmation_id" text NOT NULL,
  "proceed_request_id" text NOT NULL,
  "accepted_by_user_id" text NOT NULL,
  "accepted_at" timestamp with time zone NOT NULL,
  "booking_id" text,
  "payload" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "accepted_commercial_snapshots_request_idx"
  ON "accepted_commercial_snapshots" ("commercial_request_id");
CREATE INDEX IF NOT EXISTS "accepted_commercial_snapshots_confirmation_idx"
  ON "accepted_commercial_snapshots" ("confirmation_id");

CREATE TABLE IF NOT EXISTS "booking_document_requirements" (
  "id" text PRIMARY KEY NOT NULL,
  "booking_id" text NOT NULL,
  "document_type" text NOT NULL,
  "required" text NOT NULL,
  "source" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "booking_document_requirements_booking_idx"
  ON "booking_document_requirements" ("booking_id");

CREATE TABLE IF NOT EXISTS "booking_documents" (
  "id" text PRIMARY KEY NOT NULL,
  "booking_id" text NOT NULL,
  "requirement_id" text,
  "document_type" text NOT NULL,
  "storage_key" text NOT NULL,
  "uploaded_by_user_id" text NOT NULL,
  "uploaded_at" timestamp with time zone NOT NULL,
  "validation_status" text NOT NULL,
  "version" text NOT NULL,
  "is_current" text NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "booking_documents_booking_idx"
  ON "booking_documents" ("booking_id");
CREATE INDEX IF NOT EXISTS "booking_documents_requirement_idx"
  ON "booking_documents" ("requirement_id");
CREATE UNIQUE INDEX IF NOT EXISTS "booking_documents_storage_key_uidx"
  ON "booking_documents" ("storage_key");

CREATE TABLE IF NOT EXISTS "document_validation_results" (
  "id" text PRIMARY KEY NOT NULL,
  "document_id" text NOT NULL,
  "booking_id" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL,
  "validated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "document_validation_results_document_idx"
  ON "document_validation_results" ("document_id");
CREATE INDEX IF NOT EXISTS "document_validation_results_booking_idx"
  ON "document_validation_results" ("booking_id");
