import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    companyName: text("company_name"),
    phone: text("phone"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("users_email_uidx").on(t.email)],
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("email_verification_tokens_hash_uidx").on(t.tokenHash),
    index("email_verification_tokens_user_idx").on(t.userId),
  ],
);

export const commercialIntents = pgTable("commercial_intents", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  workflow: text("workflow").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const commercialRequests = pgTable(
  "commercial_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").notNull(),
    recipientContactId: text("recipient_contact_id"),
    subject: text("subject"),
    messageBody: text("message_body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("commercial_requests_user_idx").on(t.userId),
    index("commercial_requests_status_idx").on(t.status),
  ],
);

export const commercialContacts = pgTable(
  "commercial_contacts",
  {
    id: text("id").primaryKey(),
    organizationName: text("organization_name").notNull(),
    contactType: text("contact_type").notNull(),
    portId: text("port_id").notNull(),
    portName: text("port_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    sourceUrl: text("source_url").notNull(),
    verifiedAt: text("verified_at").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("commercial_contacts_port_idx").on(t.portId)],
);

export const commercialMessages = pgTable(
  "commercial_messages",
  {
    id: text("id").primaryKey(),
    commercialRequestId: text("commercial_request_id"),
    direction: text("direction").notNull(),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    internetMessageId: text("internet_message_id"),
    inReplyTo: text("in_reply_to"),
    referencesHeader: text("references_header"),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    replyTo: text("reply_to").notNull(),
    toAddress: text("to_address").notNull(),
    ccAddresses: text("cc_addresses"),
    subject: text("subject").notNull(),
    bodySnapshot: text("body_snapshot").notNull(),
    htmlSnapshot: text("html_snapshot"),
    deliveryStatus: text("delivery_status").notNull(),
    errorMessage: text("error_message"),
    senderTrust: text("sender_trust"),
    correlationMethod: text("correlation_method"),
    responseClassification: text("response_classification"),
    rawMetadata: jsonb("raw_metadata"),
    messageKind: text("message_kind"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
  },
  (t) => [
    index("commercial_messages_request_idx").on(t.commercialRequestId),
    uniqueIndex("commercial_messages_provider_msgid_uidx").on(
      t.provider,
      t.providerMessageId,
    ),
    index("commercial_messages_internet_msgid_idx").on(t.internetMessageId),
  ],
);

export const commercialMessageAttachments = pgTable(
  "commercial_message_attachments",
  {
    id: text("id").primaryKey(),
    commercialMessageId: text("commercial_message_id").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: text("size_bytes").notNull(),
    providerAttachmentId: text("provider_attachment_id"),
    storageReference: text("storage_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("commercial_message_attachments_msg_idx").on(t.commercialMessageId)],
);

export const commercialQuotes = pgTable(
  "commercial_quotes",
  {
    id: text("id").primaryKey(),
    commercialRequestId: text("commercial_request_id").notNull(),
    inboundMessageId: text("inbound_message_id").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("commercial_quotes_request_idx").on(t.commercialRequestId),
    index("commercial_quotes_message_idx").on(t.inboundMessageId),
  ],
);

export const commercialQuoteSelections = pgTable(
  "commercial_quote_selections",
  {
    id: text("id").primaryKey(),
    commercialRequestId: text("commercial_request_id").notNull(),
    commercialQuoteId: text("commercial_quote_id").notNull(),
    userId: text("user_id").notNull(),
    selectedAt: timestamp("selected_at", { withTimezone: true }).notNull(),
    selectionReason: text("selection_reason"),
    preferenceSnapshot: text("preference_snapshot"),
    active: text("active").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    payload: jsonb("payload"),
  },
  (t) => [
    index("commercial_quote_selections_request_idx").on(t.commercialRequestId),
    index("commercial_quote_selections_quote_idx").on(t.commercialQuoteId),
  ],
);

export const commercialProceedRequests = pgTable(
  "commercial_proceed_requests",
  {
    id: text("id").primaryKey(),
    commercialRequestId: text("commercial_request_id").notNull(),
    selectionId: text("selection_id").notNull(),
    commercialQuoteId: text("commercial_quote_id").notNull(),
    userId: text("user_id").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("commercial_proceed_requests_request_idx").on(t.commercialRequestId),
    index("commercial_proceed_requests_status_idx").on(t.status),
  ],
);

export const commercialConfirmations = pgTable(
  "commercial_confirmations",
  {
    id: text("id").primaryKey(),
    commercialRequestId: text("commercial_request_id").notNull(),
    proceedRequestId: text("proceed_request_id").notNull(),
    inboundMessageId: text("inbound_message_id").notNull(),
    userId: text("user_id").notNull(),
    classification: text("classification").notNull(),
    reviewStatus: text("review_status").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("commercial_confirmations_request_idx").on(t.commercialRequestId),
    index("commercial_confirmations_proceed_idx").on(t.proceedRequestId),
    index("commercial_confirmations_message_idx").on(t.inboundMessageId),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    commercialRequestId: text("commercial_request_id").notNull(),
    confirmationId: text("confirmation_id").notNull(),
    userId: text("user_id").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("bookings_reference_uidx").on(t.bookingReference),
    uniqueIndex("bookings_request_uidx").on(t.commercialRequestId),
    index("bookings_user_idx").on(t.userId),
    index("bookings_confirmation_idx").on(t.confirmationId),
  ],
);

export const acceptedCommercialSnapshots = pgTable(
  "accepted_commercial_snapshots",
  {
    id: text("id").primaryKey(),
    commercialRequestId: text("commercial_request_id").notNull(),
    confirmationId: text("confirmation_id").notNull(),
    proceedRequestId: text("proceed_request_id").notNull(),
    acceptedByUserId: text("accepted_by_user_id").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    bookingId: text("booking_id"),
    payload: jsonb("payload").notNull(),
  },
  (t) => [
    index("accepted_commercial_snapshots_request_idx").on(t.commercialRequestId),
    index("accepted_commercial_snapshots_confirmation_idx").on(t.confirmationId),
  ],
);

export const bookingDocumentRequirements = pgTable(
  "booking_document_requirements",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull(),
    documentType: text("document_type").notNull(),
    required: text("required").notNull(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("booking_document_requirements_booking_idx").on(t.bookingId)],
);

export const bookingDocuments = pgTable(
  "booking_documents",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull(),
    requirementId: text("requirement_id"),
    documentType: text("document_type").notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedByUserId: text("uploaded_by_user_id").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull(),
    validationStatus: text("validation_status").notNull(),
    version: text("version").notNull(),
    isCurrent: text("is_current").notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [
    index("booking_documents_booking_idx").on(t.bookingId),
    index("booking_documents_requirement_idx").on(t.requirementId),
    uniqueIndex("booking_documents_storage_key_uidx").on(t.storageKey),
  ],
);

export const documentValidationResults = pgTable(
  "document_validation_results",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull(),
    bookingId: text("booking_id").notNull(),
    status: text("status").notNull(),
    payload: jsonb("payload").notNull(),
    validatedAt: timestamp("validated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("document_validation_results_document_idx").on(t.documentId),
    index("document_validation_results_booking_idx").on(t.bookingId),
  ],
);

export const operationalHandoffs = pgTable(
  "operational_handoffs",
  {
    id: text("id").primaryKey(),
    handoffReference: text("handoff_reference").notNull(),
    bookingId: text("booking_id").notNull(),
    userId: text("user_id").notNull(),
    status: text("status").notNull(),
    version: text("version").notNull(),
    supersedesHandoffId: text("supersedes_handoff_id"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    payload: jsonb("payload").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("operational_handoffs_reference_uidx").on(t.handoffReference),
    index("operational_handoffs_booking_idx").on(t.bookingId),
    index("operational_handoffs_user_idx").on(t.userId),
    uniqueIndex("operational_handoffs_booking_version_uidx").on(
      t.bookingId,
      t.version,
    ),
  ],
);

export const shipmentExecutions = pgTable(
  "shipment_executions",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull(),
    userId: text("user_id").notNull(),
    status: text("status").notNull(),
    vesselMmsi: text("vessel_mmsi"),
    originPortId: text("origin_port_id"),
    destinationPortId: text("destination_port_id"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("shipment_executions_booking_uidx").on(t.bookingId),
    index("shipment_executions_user_idx").on(t.userId),
    index("shipment_executions_mmsi_idx").on(t.vesselMmsi),
  ],
);

export const shipmentMilestones = pgTable(
  "shipment_milestones",
  {
    id: text("id").primaryKey(),
    shipmentExecutionId: text("shipment_execution_id").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("shipment_milestones_execution_idx").on(t.shipmentExecutionId),
    index("shipment_milestones_type_idx").on(t.shipmentExecutionId, t.type),
  ],
);

export const shipmentVesselAssociations = pgTable(
  "shipment_vessel_associations",
  {
    id: text("id").primaryKey(),
    shipmentExecutionId: text("shipment_execution_id").notNull(),
    vesselMmsi: text("vessel_mmsi"),
    active: text("active").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("shipment_vessel_associations_execution_idx").on(t.shipmentExecutionId),
    index("shipment_vessel_associations_mmsi_idx").on(t.vesselMmsi),
  ],
);

export const shipmentObservations = pgTable(
  "shipment_observations",
  {
    id: text("id").primaryKey(),
    shipmentExecutionId: text("shipment_execution_id").notNull(),
    kind: text("kind").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("shipment_observations_execution_idx").on(t.shipmentExecutionId),
    index("shipment_observations_observed_idx").on(
      t.shipmentExecutionId,
      t.observedAt,
    ),
  ],
);

export const shipmentMilestoneCandidates = pgTable(
  "shipment_milestone_candidates",
  {
    id: text("id").primaryKey(),
    shipmentExecutionId: text("shipment_execution_id").notNull(),
    proposedType: text("proposed_type").notNull(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    inboundMessageId: text("inbound_message_id"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("shipment_milestone_candidates_execution_idx").on(
      t.shipmentExecutionId,
    ),
    index("shipment_milestone_candidates_status_idx").on(
      t.shipmentExecutionId,
      t.status,
    ),
    index("shipment_milestone_candidates_inbound_idx").on(t.inboundMessageId),
  ],
);

export const operationalExceptions = pgTable(
  "operational_exceptions",
  {
    id: text("id").primaryKey(),
    shipmentExecutionId: text("shipment_execution_id").notNull(),
    bookingId: text("booking_id").notNull(),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull(),
    logicalKey: text("logical_key").notNull(),
    ruleVersion: text("rule_version").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("operational_exceptions_execution_idx").on(t.shipmentExecutionId),
    index("operational_exceptions_booking_idx").on(t.bookingId),
    index("operational_exceptions_status_idx").on(
      t.shipmentExecutionId,
      t.status,
    ),
    index("operational_exceptions_logical_key_idx").on(t.logicalKey),
  ],
);

export const claimPreparations = pgTable(
  "claim_preparations",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull(),
    shipmentExecutionId: text("shipment_execution_id"),
    userId: text("user_id").notNull(),
    reference: text("reference").notNull(),
    status: text("status").notNull(),
    claimType: text("claim_type").notNull(),
    version: integer("version").notNull(),
    supersedesClaimPreparationId: text("supersedes_claim_preparation_id"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("claim_preparations_booking_idx").on(t.bookingId),
    index("claim_preparations_user_idx").on(t.userId),
    index("claim_preparations_status_idx").on(t.userId, t.status),
    index("claim_preparations_reference_idx").on(t.reference),
  ],
);

export const claimEvidenceItems = pgTable(
  "claim_evidence_items",
  {
    id: text("id").primaryKey(),
    claimPreparationId: text("claim_preparation_id").notNull(),
    type: text("type").notNull(),
    sourceId: text("source_id"),
    included: boolean("included").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("claim_evidence_items_claim_idx").on(t.claimPreparationId),
    index("claim_evidence_items_source_idx").on(
      t.claimPreparationId,
      t.type,
      t.sourceId,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    commercialRequestId: text("commercial_request_id"),
    userId: text("user_id"),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("audit_events_request_idx").on(t.commercialRequestId)],
);

/** Distributed job lease for overlapping cron protection. */
export const jobLeases = pgTable("job_leases", {
  jobName: text("job_name").primaryKey(),
  ownerId: text("owner_id").notNull(),
  leasedUntil: timestamp("leased_until", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const operationalJobRuns = pgTable(
  "operational_job_runs",
  {
    id: text("id").primaryKey(),
    jobName: text("job_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull(),
    durationMs: integer("duration_ms"),
    summary: jsonb("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("operational_job_runs_job_started_idx").on(t.jobName, t.startedAt)],
);

export const schemaMigrations = pgTable("schema_migrations", {
  filename: text("filename").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull(),
});
