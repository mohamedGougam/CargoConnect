-- Quote comparison: versioning/corrections live in commercial_quotes.payload JSON.
-- No structural table change required; this migration documents the payload contract
-- and adds a helper index on inbound message for provenance lookups.

CREATE INDEX IF NOT EXISTS "commercial_quotes_inbound_msg_idx"
  ON "commercial_quotes" ("inbound_message_id");
