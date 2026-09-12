-- Inbound commercial email capture
ALTER TABLE "commercial_messages" ALTER COLUMN "commercial_request_id" DROP NOT NULL;
ALTER TABLE "commercial_messages" ADD COLUMN IF NOT EXISTS "internet_message_id" text;
ALTER TABLE "commercial_messages" ADD COLUMN IF NOT EXISTS "in_reply_to" text;
ALTER TABLE "commercial_messages" ADD COLUMN IF NOT EXISTS "references_header" text;
ALTER TABLE "commercial_messages" ADD COLUMN IF NOT EXISTS "from_name" text;
ALTER TABLE "commercial_messages" ADD COLUMN IF NOT EXISTS "cc_addresses" text;
ALTER TABLE "commercial_messages" ADD COLUMN IF NOT EXISTS "sender_trust" text;
ALTER TABLE "commercial_messages" ADD COLUMN IF NOT EXISTS "correlation_method" text;
ALTER TABLE "commercial_messages" ADD COLUMN IF NOT EXISTS "response_classification" text;
ALTER TABLE "commercial_messages" ADD COLUMN IF NOT EXISTS "raw_metadata" jsonb;
ALTER TABLE "commercial_messages" ADD COLUMN IF NOT EXISTS "received_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "commercial_messages_provider_msgid_uidx"
  ON "commercial_messages" ("provider", "provider_message_id");
CREATE INDEX IF NOT EXISTS "commercial_messages_internet_msgid_idx"
  ON "commercial_messages" ("internet_message_id");

CREATE TABLE IF NOT EXISTS "commercial_message_attachments" (
  "id" text PRIMARY KEY NOT NULL,
  "commercial_message_id" text NOT NULL,
  "filename" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" text NOT NULL,
  "provider_attachment_id" text,
  "storage_reference" text,
  "created_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "commercial_message_attachments_msg_idx"
  ON "commercial_message_attachments" ("commercial_message_id");

CREATE TABLE IF NOT EXISTS "commercial_quotes" (
  "id" text PRIMARY KEY NOT NULL,
  "commercial_request_id" text NOT NULL,
  "inbound_message_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "commercial_quotes_request_idx"
  ON "commercial_quotes" ("commercial_request_id");
CREATE INDEX IF NOT EXISTS "commercial_quotes_message_idx"
  ON "commercial_quotes" ("inbound_message_id");
