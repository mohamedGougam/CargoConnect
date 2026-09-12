-- Operational exceptions (attention items — not incidents / claims)

CREATE TABLE IF NOT EXISTS "operational_exceptions" (
  "id" text PRIMARY KEY NOT NULL,
  "shipment_execution_id" text NOT NULL,
  "booking_id" text NOT NULL,
  "type" text NOT NULL,
  "severity" text NOT NULL,
  "status" text NOT NULL,
  "logical_key" text NOT NULL,
  "rule_version" text NOT NULL,
  "detected_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL,
  "acknowledged_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "operational_exceptions_execution_idx"
  ON "operational_exceptions" ("shipment_execution_id");
CREATE INDEX IF NOT EXISTS "operational_exceptions_booking_idx"
  ON "operational_exceptions" ("booking_id");
CREATE INDEX IF NOT EXISTS "operational_exceptions_status_idx"
  ON "operational_exceptions" ("shipment_execution_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "operational_exceptions_open_logical_key_uidx"
  ON "operational_exceptions" ("logical_key")
  WHERE "status" IN ('OPEN', 'ACKNOWLEDGED');
