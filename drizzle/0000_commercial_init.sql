CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY NOT NULL,
  "full_name" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "company_name" text,
  "phone" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_uidx" ON "users" ("email");

CREATE TABLE IF NOT EXISTS "commercial_intents" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "workflow" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "commercial_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "type" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb NOT NULL,
  "recipient_contact_id" text,
  "subject" text,
  "message_body" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "commercial_requests_user_idx" ON "commercial_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "commercial_requests_status_idx" ON "commercial_requests" ("status");

CREATE TABLE IF NOT EXISTS "commercial_contacts" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_name" text NOT NULL,
  "contact_type" text NOT NULL,
  "port_id" text NOT NULL,
  "port_name" text NOT NULL,
  "email" text,
  "phone" text,
  "website" text,
  "source_url" text NOT NULL,
  "verified_at" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "commercial_contacts_port_idx" ON "commercial_contacts" ("port_id");

CREATE TABLE IF NOT EXISTS "commercial_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "commercial_request_id" text NOT NULL,
  "direction" text NOT NULL,
  "provider" text NOT NULL,
  "provider_message_id" text,
  "from_address" text NOT NULL,
  "reply_to" text NOT NULL,
  "to_address" text NOT NULL,
  "subject" text NOT NULL,
  "body_snapshot" text NOT NULL,
  "html_snapshot" text,
  "delivery_status" text NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "commercial_messages_request_idx" ON "commercial_messages" ("commercial_request_id");

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" text PRIMARY KEY NOT NULL,
  "commercial_request_id" text NOT NULL,
  "user_id" text,
  "event_type" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "audit_events_request_idx" ON "audit_events" ("commercial_request_id");
