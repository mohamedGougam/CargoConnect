-- Shipment execution foundation (milestones, vessel association, AIS observations)
-- AIS observations are never cargo proof. No payments.

CREATE TABLE IF NOT EXISTS "shipment_executions" (
  "id" text PRIMARY KEY NOT NULL,
  "booking_id" text NOT NULL,
  "user_id" text NOT NULL,
  "status" text NOT NULL,
  "vessel_mmsi" text,
  "origin_port_id" text,
  "destination_port_id" text,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "shipment_executions_booking_uidx"
  ON "shipment_executions" ("booking_id");
CREATE INDEX IF NOT EXISTS "shipment_executions_user_idx"
  ON "shipment_executions" ("user_id");
CREATE INDEX IF NOT EXISTS "shipment_executions_mmsi_idx"
  ON "shipment_executions" ("vessel_mmsi");

CREATE TABLE IF NOT EXISTS "shipment_milestones" (
  "id" text PRIMARY KEY NOT NULL,
  "shipment_execution_id" text NOT NULL,
  "type" text NOT NULL,
  "status" text NOT NULL,
  "source" text NOT NULL,
  "occurred_at" timestamp with time zone,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "shipment_milestones_execution_idx"
  ON "shipment_milestones" ("shipment_execution_id");
CREATE INDEX IF NOT EXISTS "shipment_milestones_type_idx"
  ON "shipment_milestones" ("shipment_execution_id", "type");

CREATE TABLE IF NOT EXISTS "shipment_vessel_associations" (
  "id" text PRIMARY KEY NOT NULL,
  "shipment_execution_id" text NOT NULL,
  "vessel_mmsi" text,
  "active" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "shipment_vessel_associations_execution_idx"
  ON "shipment_vessel_associations" ("shipment_execution_id");
CREATE INDEX IF NOT EXISTS "shipment_vessel_associations_mmsi_idx"
  ON "shipment_vessel_associations" ("vessel_mmsi");

CREATE TABLE IF NOT EXISTS "shipment_observations" (
  "id" text PRIMARY KEY NOT NULL,
  "shipment_execution_id" text NOT NULL,
  "kind" text NOT NULL,
  "observed_at" timestamp with time zone NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "shipment_observations_execution_idx"
  ON "shipment_observations" ("shipment_execution_id");
CREATE INDEX IF NOT EXISTS "shipment_observations_observed_idx"
  ON "shipment_observations" ("shipment_execution_id", "observed_at");
