-- Production hardening: job leases, watcher runs, schema migration ledger

CREATE TABLE IF NOT EXISTS "schema_migrations" (
  "filename" text PRIMARY KEY NOT NULL,
  "applied_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "job_leases" (
  "job_name" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "leased_until" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "operational_job_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "job_name" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone,
  "status" text NOT NULL,
  "duration_ms" integer,
  "summary" jsonb,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "operational_job_runs_job_started_idx"
  ON "operational_job_runs" ("job_name", "started_at");
